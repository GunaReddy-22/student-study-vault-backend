const express = require("express");
const router = express.Router();

const groq = require("../utils/groq");
const Note = require("../models/Note");

const {
  getRetriever,
} = require("../services/ragService");

const {
  createRetrievalChain,
} = require("@langchain/classic/chains/retrieval");

/*const {
  createHistoryAwareRetriever,
} = require("@langchain/classic/chains/history_aware_retriever");*/

const {
  createStuffDocumentsChain,
} = require("@langchain/classic/chains/combine_documents");

const {
  ChatPromptTemplate,
} = require("@langchain/core/prompts");

const {
  ChatGroq,
} = require("@langchain/groq");


// =========================
// SUMMARIZE NOTE
// =========================

router.post("/summarize", async (req, res) => {
  try {
    const { content } = req.body;

    const response =
      await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "Summarize the following content in clear bullet points.",
          },
          {
            role: "user",
            content: content.slice(0, 3000),
          },
        ],
      });

    res.json({
      summary:
        response.choices[0].message.content,
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Summary failed",
    });
  }
});


// =========================
// ASK AI (CONVERSATIONAL RAG)
// =========================

router.post("/ask", async (req, res) => {
  try {
    const {
      noteId,
      question,
      chatHistory = [],
    } = req.body;

    if (!noteId || !question) {
      return res.status(400).json({
        message: "noteId and question are required",
      });
    }

    const note = await Note.findById(noteId);

    if (!note) {
      return res.status(404).json({
        message: "Note not found",
      });
    }

    // =========================
    // RETRIEVER
    // =========================

    const retriever =
      await getRetriever(noteId);

    // =========================
    // LLM
    // =========================

    const llm = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
    });

    // =========================
    // CHAT HISTORY
    // =========================

    const historyMessages =
      chatHistory.slice(-10);

    const historyText =
      chatHistory
        .slice(-10)
        .map(
          (msg) =>
            `${msg.role}: ${msg.content}`
        )
        .join("\n");

    // =========================
    // HISTORY AWARE RETRIEVER
    // =========================

    /*const rephrasePrompt =
      ChatPromptTemplate.fromTemplate(`
Given the conversation history and latest user question,
rewrite the question into a standalone question.

Conversation:
{chat_history}

Question:
{input}

Standalone Question:
`);

    const historyAwareRetriever =
      await createHistoryAwareRetriever({
        llm,
        retriever,
        rephrasePrompt,
      });*/

    // =========================
    // ANSWER PROMPT
    // =========================
    

    const prompt = ChatPromptTemplate.fromTemplate(`
You are StudyVault AI, an intelligent note assistant.
Answer questions using ONLY the retrieved note content below.

Retrieved Context:
{context}

Previous Conversation:
{history}

Current Question:
{input}

==================================================
RULES
==================================================

1. Use ONLY the Retrieved Context as your source of facts.
2. NEVER use outside knowledge, assumptions, or training data.
3. Use Previous Conversation ONLY to resolve vague references
   (it, that, this, next, before, after, etc.).
4. Keep answers 2–5 sentences. Use bullet points only when helpful.
5. Rephrase in your own words. Do not copy large chunks from context.

==================================================
SEQUENTIAL QUESTIONS
==================================================

For questions like "what comes next", "before that", "after that":
- Identify the topic from conversation history
- Look for it in the Retrieved Context
- If not found, reply: "I couldn't find that in this note. Try asking about topics covered in the note."

==================================================
FALLBACK
==================================================

If the answer is NOT found in the Retrieved Context, reply EXACTLY:
"I couldn't find information related to your question in this note. Try asking about topics covered in the note."

==================================================
GREETINGS (check this LAST)
==================================================

ONLY if the user's message is exactly one of these words and nothing else:
hi, hello, hey, good morning, good evening

Then reply EXACTLY: "Hello! Ask me anything about this note."
Do NOT apply this rule to any other message.

Answer:
`);

    const combineDocsChain =
      await createStuffDocumentsChain({
        llm,
        prompt,
      });

    const retrievalChain =
      await createRetrievalChain({
        retriever,
        combineDocsChain,
      });

    // =========================
    // DEBUG
    // =========================

    console.log("QUESTION:", question);

    console.log(
      "HISTORY TEXT:",
      historyText
    );

    console.log(
      "HISTORY MESSAGES:",
      historyMessages
    );

    // =========================
    // ASK
    // =========================
    console.log("QUESTION:", question);
console.log("HISTORY:", historyText);
console.log(
  "QUESTION TYPE:",
  typeof question
);

console.log(
  "QUESTION VALUE:",
  JSON.stringify(question)
);




const docs = await retriever.invoke(question);

const context = docs
  .map(doc => doc.pageContent)
  .join("\n\n");

console.log("CONTEXT:");
console.log(context);

const response =
  await retrievalChain.invoke({
    input: question,
    history: historyText,
  });

    console.log(
      "ANSWER:",
      response.answer
    );

    res.json({
      answer: response.answer,
    });

  } catch (err) {
    console.error(
      "AI Ask Error:",
      err
    );

    res.status(500).json({
      message: "AI failed",
    });
  }
});

module.exports = router;