const express = require("express");
const router = express.Router();
const groq = require("../utils/groq");
const Note = require("../models/Note");

// 🔹 SUMMARIZE NOTE


// ✅ NEW
router.post("/summarize", async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ message: "No content provided" });
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "Summarize the following content in clear bullet points.",
        },
        {
          role: "user",
          content: content.slice(0, 3000),
        },
      ],
    });

    res.json({
      summary: response.choices[0].message.content,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI failed" });
  }
});


router.post("/ask", async (req, res) => {
  try {
    const { question, content } = req.body;

    if (!question || !content) {
      return res.status(400).json({ message: "Missing data" });
    }

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
           content: `
You are a friendly AI assistant inside a student study app.

Behavior rules:
1. If the user greets (hi, hello, how are you), respond casually and friendly.
2. If the question is related to the provided notes, answer using the notes.
3. If partially related, combine notes + your knowledge.
4. If not related to notes, answer normally using general knowledge.
5. Keep answers simple, clear, and student-friendly.
6. For concepts, explain briefly with examples when helpful.
7. Avoid saying "not in notes" unless necessary.
      `,
        },
        {
          role: "user",
          content: `Notes:\n${content}\n\nQuestion:\n${question}`,
        },
      ],
    });

    res.json({
      answer: response.choices[0].message.content,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "AI failed" });
  }
});
module.exports = router;