// utils/groq.js
require("dotenv").config();
const Groq = require("groq-sdk");

const GROQ_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
  "allam-2-7b",
];

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY || "placeholder",
  });
}



async function generateChatCompletion({ messages, temperature = 0.25, maxTokens = 4096, responseFormat = null }) {
  let lastError = null;

  for (const model of GROQ_MODELS) {
    try {
      const payload = {
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      };

      if (responseFormat) {
        payload.response_format = responseFormat;
      }

      const client = getGroqClient();
      const response = await client.chat.completions.create(payload);

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
  groq: getGroqClient(),
  getGroqClient,
  generateChatCompletion,
  GROQ_MODELS,
};