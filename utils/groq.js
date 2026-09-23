// utils/groq.js
const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const GROQ_MODELS = [
  "openai/gpt-oss-20b",
  "gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

async function generateChatCompletion({ messages, temperature = 0.3, maxTokens = 1500 }) {
  let lastError = null;

  for (const model of GROQ_MODELS) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      if (response && response.choices && response.choices[0]?.message?.content) {
        return {
          content: response.choices[0].message.content,
          modelUsed: model,
        };
      }
    } catch (err) {
      console.warn(`[Groq Model] ${model} attempt failed: ${err.message}. Trying fallback...`);
      lastError = err;
    }
  }

  throw lastError || new Error("Groq completion failed");
}

module.exports = {
  groq,
  generateChatCompletion,
  GROQ_MODELS,
};
