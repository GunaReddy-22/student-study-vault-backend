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
        content: `You are StudyVault AI, an expert academic note summarizer.
Create a beautifully structured, easy-to-read summary.

Formatting Requirements:
1. Provide a brief 1-2 sentence core overview at the top.
2. Organize main topics into clean sections (e.g., **Key Concepts**, **Core Components**, **Workflow / Steps**, **Important Takeaways**).
3. Place EVERY bullet point on its own separate line using '- ' or numbered '1. '.
4. NEVER combine or squish multiple bullet items onto the same line.
5. Bold key terminology (e.g., - **Component Name**: Explanation).
6. Ensure clean spacing between sections so it is pleasing and easy for students to study.`,
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

      // Retrieve Context (Prioritize direct note content for sub-second responses, or fast RAG fallback)
      let retrievedContext = "";
      if (note.content && note.content.length <= 25000) {
        retrievedContext = note.content;
      } else {
        try {
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("RAG timeout")), 1200)
          );
          const retrieverPromise = (async () => {
            const retriever = await getRetriever(noteId);
            if (retriever) {
              const docs = await retriever.invoke(userQuestion);
              if (docs && docs.length > 0) {
                return docs.map((doc) => doc.pageContent).join("\n\n");
              }
            }
            return "";
          })();

          retrievedContext = await Promise.race([retrieverPromise, timeoutPromise]);
        } catch (ragErr) {
          console.warn(`[RAG] Vector retrieval skipped/timed out:`, ragErr.message);
        }

        if (!retrievedContext || !retrievedContext.trim()) {
          retrievedContext = (note.content || "").slice(0, 25000);
        }
      }

      const notePrompt = `You are StudyVault AI, a helpful, intelligent academic study assistant.
Help the student understand the topic using the provided Note Context as the primary source of truth, combined with your educational knowledge to provide clear, accurate, and insightful explanations.

Note Context:
${retrievedContext}

==================================================
GUIDELINES & FORMATTING
==================================================
1. Ground your explanation in the Note Context provided above.
2. When the student asks about a concept, term, or stage mentioned or related to the note (such as definitions, workflows, components, or examples), explain it clearly and thoroughly within the context of the subject.
3. Structure your response cleanly for studying:
   - Provide a direct, intuitive explanation.
   - When listing items, components, or steps, format EACH bullet point on its own separate line using '- **Title**: Explanation' or numbered lists.
   - NEVER squish multiple bullet points on the same line.
   - Bold key terminology for clarity and emphasis.
4. Only if the student's question is completely unrelated to anything in the note or its subject domain, politely explain what the note covers and suggest asking about the note's topics.`;

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


    const defaultGlobalPrompt = `You are StudyVault AI, the helpful AI assistant of StudyVault platform.
Help students with study techniques, coding, exams, productivity, and platform usage.

Formatting Guidelines:
- Break responses into clean paragraphs and well-spaced bullet points.
- Place every bullet point on a separate line.
- Use bold text for key terms.
- Keep answers friendly, concise, encouraging, and student-focused.`;

    const globalPrompt = (content && content.length > 50)
      ? content
      : defaultGlobalPrompt;

    const messages = [
      { role: "system", content: globalPrompt },
      ...formattedHistory,
      { role: "user", content: userQuestion || "Hello!" },
    ];

    const result = await generateChatCompletion({
      messages,
      temperature: 0.4,
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

/* ==================================================
   HELPER: ACCESS VERIFICATION
================================================== */
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const QuizAttempt = require("../models/QuizAttempt");

const verifyNoteAccess = async (req, noteId) => {
  if (!noteId) {
    return { error: "Note ID is required", status: 400 };
  }

  const note = await Note.findById(noteId);
  if (!note) {
    return { error: "Note not found", status: 404 };
  }

  // Extract token if provided
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    } catch (e) {
      // invalid token
    }
  }

  // 1. Public non-premium notes are accessible to everyone
  if (note.isPublic && !note.isPremium) {
    return { note, userId };
  }

  // Private or Premium notes require valid login
  if (!userId) {
    return {
      error: "Authentication required to access this note's quiz. Please log in.",
      status: 401,
    };
  }

  // 2. Private notes (Owner only)
  if (!note.isPublic && !note.isPremium) {
    if (note.userId.toString() !== userId.toString()) {
      return {
        error: "Access denied. You do not own this private note.",
        status: 403,
      };
    }
    return { note, userId };
  }

  // 3. Premium notes (Owner OR Purchased User)
  if (note.isPremium) {
    if (note.userId.toString() === userId.toString()) {
      return { note, userId };
    }
    const user = await User.findById(userId);
    const hasPurchased =
      user &&
      user.purchasedNotes &&
      user.purchasedNotes.some((id) => id.toString() === note._id.toString());

    if (!hasPurchased) {
      return {
        error: "Access denied. You need to unlock or purchase this premium note to access its quiz.",
        status: 403,
      };
    }
    return { note, userId };
  }

  return { note, userId };
};

/* ==================================================
   HELPER: SAFE JSON EXTRACTION
================================================== */
function safeParseJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {}

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  return null;
}

/* ==================================================
   HELPER: SMART FALLBACK QUIZ GENERATOR
================================================== */
function generateFallbackQuiz(note) {
  const content = (note.content || "").trim();
  
  // Clean sentences & clauses
  const sentences = content
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const fullText = sentences.join(" ");

  // Extract capitalized words / key terms / numbers / dates
  const properTerms = Array.from(
    new Set(
      (content.match(/\b([A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)*|\d+(?:st|nd|rd|th)?(?:\s+(?:century|BCE|CE|AD))?)\b/g) || [])
        .filter((t) => t.length > 2 && !["The", "This", "That", "There", "Here", "What", "When", "Where", "How", "Feel", "Free"].includes(t))
    )
  );

  const keywords = Array.from(
    new Set(
      (content.match(/\b[a-zA-Z]{5,}\b/g) || [])
        .map((w) => w.toLowerCase())
        .filter((w) => !["about", "which", "their", "there", "these", "those", "would", "could", "should", "using", "other", "under", "after", "before"].includes(w))
    )
  );

  const questions = [];

  // Question 1: Core Summary / Definition MCQ
  const leadSentence = sentences[0] || content;
  questions.push({
    id: 1,
    type: "mcq",
    question: `What is the primary definition or core concept of "${note.title}" according to the note?`,
    options: [
      leadSentence.length > 95 ? leadSentence.slice(0, 92) + "..." : leadSentence,
      `A standalone theoretical framework unrelated to ${note.subject}.`,
      `An outdated methodology that has been superseded in modern curriculum.`,
      `A secondary reference system with no practical or historical impact.`,
    ],
    correctAnswer: leadSentence.length > 95 ? leadSentence.slice(0, 92) + "..." : leadSentence,
    hint: `Focus on the foundational opening statement of the note.`,
    topic: `${note.subject} Fundamentals`,
    explanation: `As stated in the source note: "${leadSentence.slice(0, 140)}". This forms the primary definition and core premise of the subject.`,
  });

  // Question 2: Key Entity / Component MCQ
  const secondSentence = sentences[1] || sentences[0];
  const primaryTerm = properTerms[0] || keywords[0] || note.subject;
  questions.push({
    id: 2,
    type: "mcq",
    question: `Which key factor or entity is explicitly emphasized in the context of "${note.title}"?`,
    options: [
      secondSentence.length > 95 ? secondSentence.slice(0, 92) + "..." : secondSentence,
      `A decentralized model operating without any structured protocols.`,
      `A strictly hypothetical scenario that never materialized in real-world application.`,
      `An isolated event with negligible influence on ${note.subject}.`,
    ],
    correctAnswer: secondSentence.length > 95 ? secondSentence.slice(0, 92) + "..." : secondSentence,
    hint: `Refer to the specific explanations and historical/technical facts detailed in the note.`,
    topic: `${note.subject} Concepts`,
    explanation: `The note explains: "${secondSentence.slice(0, 140)}". This highlights the specific significance and mechanics discussed in the material.`,
  });

  // Question 3: Functional / Cultural Impact MCQ
  const thirdSentence = sentences[2] || sentences[Math.min(1, sentences.length - 1)];
  questions.push({
    id: 3,
    type: "mcq",
    question: `What was the key outcome, function, or purpose highlighted in the note?`,
    options: [
      thirdSentence.length > 95 ? thirdSentence.slice(0, 92) + "..." : thirdSentence,
      `To restrict communication and limit regional interaction.`,
      `To replace established foundational standards with unverified practices.`,
      `To serve solely as an internal administrative notation.`,
    ],
    correctAnswer: thirdSentence.length > 95 ? thirdSentence.slice(0, 92) + "..." : thirdSentence,
    hint: `Think about the broader consequences and utility discussed in the text.`,
    topic: `${note.subject} Impact`,
    explanation: `According to the note: "${thirdSentence.slice(0, 140)}". This directly describes the real-world function, exchange, or takeaway of this topic.`,
  });

  // Question 4: Fill in the blank (Specific Entity or Key Term)
  let targetSentence1 = sentences.find((s) => s.length > 35) || sentences[0];
  let targetWord1 =
    properTerms.find((t) => targetSentence1.includes(t) && t.split(" ").length === 1) ||
    keywords.find((k) => new RegExp(`\\b${k}\\b`, "i").test(targetSentence1)) ||
    "trade";

  // Create blank
  let blanked1 = targetSentence1.replace(new RegExp(`\\b${targetWord1}\\b`, "i"), "______");
  if (blanked1.length > 120) blanked1 = blanked1.slice(0, 117) + "...";

  questions.push({
    id: 4,
    type: "blank",
    question: `Fill in the blank from the note: "${blanked1}"`,
    correctAnswer: targetWord1,
    hint: `The missing term has ${targetWord1.length} letters and starts with "${targetWord1[0]}".`,
    topic: "Key Terminology",
    explanation: `The full passage reads: "${targetSentence1.slice(0, 150)}". The missing term "${targetWord1}" is essential to accurately describing this concept.`,
  });

  // Question 5: Fill in the blank (Timeline / Specific Attribute)
  let targetSentence2 =
    sentences.find((s, idx) => idx > 0 && s.length > 30 && s !== targetSentence1) ||
    sentences[sentences.length - 1];
  
  let targetWord2 =
    properTerms.find((t) => t.toLowerCase() !== targetWord1.toLowerCase() && targetSentence2.includes(t) && t.split(" ").length === 1) ||
    keywords.find((k) => k.toLowerCase() !== targetWord1.toLowerCase() && new RegExp(`\\b${k}\\b`, "i").test(targetSentence2)) ||
    "cultures";

  let blanked2 = targetSentence2.replace(new RegExp(`\\b${targetWord2}\\b`, "i"), "______");
  if (blanked2.length > 120) blanked2 = blanked2.slice(0, 117) + "...";

  questions.push({
    id: 5,
    type: "blank",
    question: `Complete the missing word: "${blanked2}"`,
    correctAnswer: targetWord2,
    hint: `The missing term has ${targetWord2.length} letters and begins with "${targetWord2[0]}".`,
    topic: "Core Vocabulary",
    explanation: `The source text states: "${targetSentence2.slice(0, 150)}". Completing this with "${targetWord2}" restores the precise factual meaning of the sentence.`,
  });

  return {
    quizTitle: `Quiz: ${note.title}`,
    noteId: note._id.toString(),
    totalQuestions: 5,
    questions,
  };
}

// ==================================================
// 🧠 GENERATE QUIZ (5 QUESTIONS: 3 MCQS + 2 BLANKS)
// ==================================================
router.post("/quiz/generate", async (req, res) => {
  try {
    const { noteId } = req.body;

    const access = await verifyNoteAccess(req, noteId);
    if (access.error) {
      return res.status(access.status).json({ message: access.error });
    }

    const { note } = access;
    let content = (note.content || "").trim();
    const isHandwritten = content.startsWith("data:image");

    if (!isHandwritten && (!content || content.length < 10)) {
      return res.status(400).json({
        message: "This note does not have enough content to generate a quiz.",
      });
    }

    // Attempt Groq LLM Generation
    try {
      const systemPrompt = `You are StudyVault AI Quiz Engine, an expert academic professor.
Your task is to generate exactly 5 high-quality assessment questions based on the provided note topic and subject.

Structure Requirements:
- EXACTLY 5 questions.
- Questions 1, 2, 3 MUST be 'mcq' (Multiple Choice with exactly 4 distinct, plausible choices: A, B, C, D).
- Questions 4, 5 MUST be 'blank' (Fill in the blank with '______' inside the question statement).
- Every question MUST have a thorough, 1-2 sentence 'explanation' detailing WHY the correct answer is true, citing foundational concepts.
- Output MUST be a valid raw JSON object matching this schema:

{
  "quizTitle": "Quiz: [Subject or Note Title]",
  "noteId": "${note._id}",
  "totalQuestions": 5,
  "questions": [
    {
      "id": 1,
      "type": "mcq",
      "question": "What is ...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "Option A",
      "hint": "Brief concept clue",
      "topic": "Specific sub-topic name",
      "explanation": "Detailed explanation citing the concept"
    },
    ...
  ]
}`;

      const userPrompt = isHandwritten
        ? `This is a handwritten study note with diagrams.
Note Title: ${note.title}
Subject: ${note.subject}
Key Topics: Core principles, formulas, definitions, and applications related to ${note.title} in ${note.subject}.

Generate 5 rigorous, insightful academic quiz questions testing a student's mastery of ${note.title} (${note.subject}) now in valid JSON.`
        : `Note Title: ${note.title}
Subject: ${note.subject}
Note Content:
${content.slice(0, 10000)}

Generate the 5-question quiz now in valid JSON.`;

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      const result = await generateChatCompletion({
        messages,
        temperature: 0.2,
        maxTokens: 1800,
      });

      const parsedQuiz = safeParseJSON(result.content);

      if (
        parsedQuiz &&
        Array.isArray(parsedQuiz.questions) &&
        parsedQuiz.questions.length >= 3
      ) {
        parsedQuiz.questions = parsedQuiz.questions.slice(0, 5).map((q, idx) => ({
          id: q.id || idx + 1,
          type: q.type === "blank" ? "blank" : "mcq",
          question: q.question || "Question?",
          options: Array.isArray(q.options) ? q.options : ["True", "False"],
          correctAnswer: q.correctAnswer || "",
          hint: q.hint || "",
          topic: q.topic || note.subject || "General",
          explanation: q.explanation || `The note discusses "${q.correctAnswer}" as a key concept in ${note.subject}.`,
        }));

        return res.json({
          success: true,
          quiz: parsedQuiz,
          modelUsed: result.modelUsed,
        });
      }
    } catch (llmErr) {
      console.warn(
        "[Quiz Generation] LLM unavailable, activating smart heuristic quiz generator:",
        llmErr.message
      );
    }

    // Intelligent heuristic fallback
    const fallbackQuiz = generateFallbackQuiz(note);
    return res.json({
      success: true,
      quiz: fallbackQuiz,
      modelUsed: "studyvault-heuristic-v1",
    });
  } catch (err) {
    console.error("[Quiz Generation Error]:", err);
    res.status(500).json({
      message: "Failed to generate quiz",
      error: err.message,
    });
  }
});

// ==================================================
// 📊 EVALUATE QUIZ & PRODUCE DETAILED FEEDBACK
// ==================================================
router.post("/quiz/evaluate", async (req, res) => {
  try {
    const { noteId, questions, userAnswers } = req.body;

    const access = await verifyNoteAccess(req, noteId);
    if (access.error) {
      return res.status(access.status).json({ message: access.error });
    }

    const { note, userId } = access;

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: "Questions array is required" });
    }

    const answersMap = {};
    (userAnswers || []).forEach((ans) => {
      answersMap[ans.questionId] = ans.userAnswer;
    });

    const evaluationPrompt = `You are StudyVault AI Evaluation Assessor.
You are grading a student's quiz answers against the source note.

Source Note Title: ${note.title}
Source Note Subject: ${note.subject}
Source Note Context:
${(note.content || "").slice(0, 8000)}

Quiz Questions & Student Submissions:
${JSON.stringify(
  questions.map((q) => ({
    id: q.id,
    type: q.type,
    question: q.question,
    expectedAnswer: q.correctAnswer,
    studentAnswer: answersMap[q.id] || "(Unanswered)",
    topic: q.topic,
    baseExplanation: q.explanation,
  })),
  null,
  2
)}

Evaluation Rules:
1. For MCQ: Student answer must match the expected option concept.
2. For Fill-in-the-Blank: Evaluate semantically. Accept minor spelling variations or synonymous terms that are factually true according to the note.
3. Calculate 'totalScore', 'maxScore', 'percentage', and 'grade'.
4. For EACH question in 'results', provide a detailed, educational 'explanation' (2-3 sentences) explaining WHY the correct answer is true based on the note, and contrasting it with the student's submission.
5. Generate 2-3 specific 'improvementAreas' identifying exact topics from the note to review.
6. Generate 2 actionable 'studyTips'.

Respond ONLY with valid JSON in this exact structure:
{
  "totalScore": 4,
  "maxScore": 5,
  "percentage": 80,
  "grade": "Good",
  "summary": "Detailed performance overview...",
  "improvementAreas": [
    "Review topic X from the note",
    "Revisit the distinction between Y and Z"
  ],
  "studyTips": [
    "Re-read the definition of...",
    "Practice summarizing..."
  ],
  "results": [
    {
      "questionId": 1,
      "question": "...",
      "type": "mcq",
      "userAnswer": "...",
      "correctAnswer": "...",
      "isCorrect": true,
      "explanation": "Comprehensive academic explanation citing the note...",
      "topic": "..."
    }
  ]
}`;

    let evaluation = null;
    let modelUsed = "studyvault-heuristic-v1";

    try {
      const messages = [
        {
          role: "system",
          content:
            "You are an accurate academic evaluator. Always provide thorough, multi-sentence conceptual explanations for every question. Output valid JSON only.",
        },
        { role: "user", content: evaluationPrompt },
      ];

      const result = await generateChatCompletion({
        messages,
        temperature: 0.1,
        maxTokens: 2200,
      });

      evaluation = safeParseJSON(result.content);
      if (evaluation && typeof evaluation.totalScore === "number") {
        modelUsed = result.modelUsed;
      }
    } catch (llmErr) {
      console.warn(
        "[Quiz Evaluation] LLM unavailable, activating smart heuristic evaluator:",
        llmErr.message
      );
    }

    if (!evaluation || typeof evaluation.totalScore !== "number") {
      console.log("Using smart heuristic quiz evaluation with comprehensive explanations");

      let calculatedScore = 0;
      const results = questions.map((q) => {
        const rawStudentAns = (answersMap[q.id] || "").trim();
        const studentAns = rawStudentAns.toLowerCase();
        const expected = (q.correctAnswer || "").trim().toLowerCase();

        // Semantic & fuzzy matching
        const isCorrect =
          studentAns.length > 0 &&
          (studentAns === expected ||
            expected.includes(studentAns) ||
            studentAns.includes(expected) ||
            (q.type === "mcq" && q.options && q.options.some((opt) => opt.toLowerCase() === studentAns && opt.toLowerCase().includes(expected))));

        if (isCorrect) calculatedScore++;

        // Build rich, clear educational explanation
        let detailedExplanation = "";
        if (q.explanation && q.explanation.length > 20) {
          detailedExplanation = isCorrect
            ? `✅ Correct! ${q.explanation}`
            : `❌ Incorrect. You submitted "${rawStudentAns || "Unanswered"}", but the correct answer is "${q.correctAnswer}". ${q.explanation}`;
        } else {
          detailedExplanation = isCorrect
            ? `✅ Correct! "${q.correctAnswer}" is the accurate concept stated in the note for "${q.topic || note.subject}".`
            : `❌ Incorrect. You submitted "${rawStudentAns || "Unanswered"}". The correct concept is "${q.correctAnswer}", which is the key principle emphasized in the note for "${q.topic || note.subject}".`;
        }

        return {
          questionId: q.id,
          question: q.question,
          type: q.type,
          userAnswer: rawStudentAns || "(Unanswered)",
          correctAnswer: q.correctAnswer,
          isCorrect: !!isCorrect,
          explanation: detailedExplanation,
          topic: q.topic || note.subject,
        };
      });

      const missedTopics = results
        .filter((r) => !r.isCorrect)
        .map((r) => r.topic);

      const uniqueMissedTopics = Array.from(new Set(missedTopics));

      const improvementAreas =
        uniqueMissedTopics.length > 0
          ? uniqueMissedTopics.map(
              (top) =>
                `Review the section on "${top}" in "${note.title}" to reinforce your grasp of key terminology and dates.`
            )
          : [
              `Excellent work! You demonstrated complete mastery of "${note.title}". Continue reviewing to maintain long-term retention.`,
            ];

      const studyTips =
        calculatedScore === questions.length
          ? [
              `Try summarizing "${note.title}" from memory in 3 bullet points to test active recall.`,
              `Explore related notes in ${note.subject} to build broader conceptual connections.`,
            ]
          : [
              `Re-read the source text focusing on specific dates, proper nouns, and definitions.`,
              `Create flashcards for key terms like "${results.filter((r) => !r.isCorrect).map((r) => r.correctAnswer).slice(0, 2).join('", "')}" before retaking the quiz.`,
            ];

      const fallbackEvaluation = {
        totalScore: calculatedScore,
        maxScore: questions.length,
        percentage: Math.round((calculatedScore / questions.length) * 100),
        grade:
          calculatedScore === 5
            ? "Mastery"
            : calculatedScore >= 4
            ? "Excellent"
            : calculatedScore >= 3
            ? "Good"
            : "Needs Revision",
        summary:
          calculatedScore >= 4
            ? `Outstanding performance! You answered ${calculatedScore} out of ${questions.length} questions correctly, showing strong comprehension of "${note.title}".`
            : `You scored ${calculatedScore} out of ${questions.length}. Focus on the missed areas below to improve your understanding of "${note.title}".`,
        improvementAreas,
        studyTips,
        results,
      };

      // Save attempt if user is authenticated
      if (userId) {
        try {
          await QuizAttempt.create({
            userId,
            noteId: note._id,
            score: fallbackEvaluation.totalScore,
            maxScore: fallbackEvaluation.maxScore,
            percentage: fallbackEvaluation.percentage,
            grade: fallbackEvaluation.grade,
            improvementAreas: fallbackEvaluation.improvementAreas,
            results: fallbackEvaluation.results,
          });
        } catch (dbErr) {
          console.error("Failed to save quiz attempt:", dbErr);
        }
      }

      return res.json({ success: true, evaluation: fallbackEvaluation });
    }

    // Save attempt in DB if user is logged in
    if (userId) {
      try {
        await QuizAttempt.create({
          userId,
          noteId: note._id,
          score: evaluation.totalScore,
          maxScore: evaluation.maxScore || questions.length,
          percentage:
            evaluation.percentage ||
            Math.round((evaluation.totalScore / questions.length) * 100),
          grade: evaluation.grade || "Good",
          improvementAreas: evaluation.improvementAreas || [],
          results: evaluation.results || [],
        });
      } catch (dbErr) {
        console.error("Failed to save quiz attempt:", dbErr);
      }
    }

    return res.json({
      success: true,
      evaluation,
      modelUsed,
    });
  } catch (err) {
    console.error("[Quiz Evaluation Error]:", err);
    res.status(500).json({
      message: "Failed to evaluate quiz",
      error: err.message,
    });
  }
});

// ==================================================
// 📜 GET QUIZ ATTEMPTS HISTORY FOR NOTE
// ==================================================
router.get("/quiz/history/:noteId", async (req, res) => {
  try {
    const access = await verifyNoteAccess(req, req.params.noteId);
    if (access.error) {
      return res.status(access.status).json({ message: access.error });
    }

    if (!access.userId) {
      return res.json({ history: [] });
    }

    const history = await QuizAttempt.find({
      userId: access.userId,
      noteId: req.params.noteId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch quiz history" });
  }
});

module.exports = router;