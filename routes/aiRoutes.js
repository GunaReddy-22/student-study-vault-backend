const express = require("express");
const router = express.Router();

const Note = require("../models/Note");
const { getRetriever } = require("../services/ragService");
const { generateChatCompletion } = require("../utils/groq");

// =========================
// SUMMARIZE NOTE
// =========================
router.post("/summarize", async (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        message: "Content is required",
      });
    }

    const messages = [
      {
        role: "system",
        content:
          "Summarize the following content in clear bullet points.",
      },
      {
        role: "user",
        content: content.slice(0, 10000),
      },
    ];

    const result = await generateChatCompletion({
      messages,
      temperature: 0.3,
      maxTokens: 1000,
    });

    res.json({
      summary: result.content,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error("[AI Summarize Error]:", err);
    res.status(500).json({
      message: "Summary failed",
    });
  }
});

// =========================
// ASK AI (CONVERSATIONAL RAG & CHAT)
// =========================
router.post("/ask", async (req, res) => {
  try {
    const {
      noteId,
      question,
      content,
      chatHistory = [],
    } = req.body;

    const userQuestion = (question || (noteId ? "" : content) || "").trim();

    if (!userQuestion && !content) {
      return res.status(400).json({
        message: "Question is required",
      });
    }

    // Format chat history
    const formattedHistory = Array.isArray(chatHistory)
      ? chatHistory.slice(-8).map((msg) => ({
          role: msg.role === "assistant" || msg.type === "a" ? "assistant" : "user",
          content: msg.content || msg.text || "",
        }))
      : [];

    // ==========================================
    // 1. NOTE RAG (WHEN noteId IS PROVIDED)
    // ==========================================
    if (noteId) {
      const note = await Note.findById(noteId);

      if (!note) {
        return res.status(404).json({
          message: "Note not found",
        });
      }

      // Check greetings
      const lowerQ = userQuestion.toLowerCase().trim();
      if (["hi", "hello", "hey", "good morning", "good evening"].includes(lowerQ)) {
        return res.json({
          answer: "Hello! Ask me anything about this note.",
        });
      }

      // Retrieve Context from Pinecone
      let retrievedContext = "";
      try {
        const retriever = await getRetriever(noteId);
        if (retriever) {
          const docs = await retriever.invoke(userQuestion);
          if (docs && docs.length > 0) {
            retrievedContext = docs.map((doc) => doc.pageContent).join("\n\n");
          }
        }
      } catch (ragErr) {
        console.warn(`[RAG] Vector retrieval failed, falling back to note content:`, ragErr.message);
      }

      // Fallback: If vector retrieval returned empty, use note content directly
      if (!retrievedContext || !retrievedContext.trim()) {
        retrievedContext = (note.content || "").slice(0, 12000);
      }

      const notePrompt = `You are StudyVault AI, an intelligent note assistant.
Answer questions using ONLY the retrieved note content below.

Retrieved Context:
${retrievedContext}

==================================================
RULES
==================================================

1. Use ONLY the Retrieved Context as your source of facts.
2. NEVER use outside knowledge, assumptions, or training data.
3. Use Previous Conversation ONLY to resolve vague references (it, that, this, next, before, after, etc.).
4. Keep answers 2–5 sentences. Use bullet points only when helpful.
5. Rephrase in your own words. Do not copy large chunks from context.

==================================================
FALLBACK
==================================================

If the answer is NOT found in the Retrieved Context, reply EXACTLY:
"I couldn't find information related to your question in this note. Try asking about topics covered in the note."`;

      const messages = [
        { role: "system", content: notePrompt },
        ...formattedHistory,
        { role: "user", content: userQuestion },
      ];

      const result = await generateChatCompletion({
        messages,
        temperature: 0.3,
        maxTokens: 1000,
      });

      return res.json({
        answer: result.content,
        modelUsed: result.modelUsed,
      });
    }

    // ==========================================
    // 2. GLOBAL CHATBOT (WHEN noteId IS NOT PROVIDED)
    // ==========================================
    const globalPrompt = (content && content.length > 50)
      ? content
      : `You are StudyVault AI, the general AI assistant of StudyVault platform.
Help students with study techniques, coding, exams, productivity, and platform usage. Keep answers friendly, concise, and helpful.`;

    const messages = [
      { role: "system", content: globalPrompt },
      ...formattedHistory,
      { role: "user", content: userQuestion || "Hello!" },
    ];

    const result = await generateChatCompletion({
      messages,
      temperature: 0.5,
      maxTokens: 1200,
    });

    return res.json({
      answer: result.content,
      modelUsed: result.modelUsed,
    });
  } catch (err) {
    console.error("AI Ask Error:", err);
    res.status(500).json({
      message: "AI failed",
      error: err.message,
    });
  }
});

module.exports = router;
