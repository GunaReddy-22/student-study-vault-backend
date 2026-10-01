require("dotenv").config();

const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
const { PineconeStore } = require("@langchain/pinecone");
const { Pinecone } = require("@pinecone-database/pinecone");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const hasHF = !!process.env.HUGGINGFACE_API_KEY;
const hasPinecone = !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME);

let embeddings = null;
if (hasHF) {
  embeddings = new HuggingFaceInferenceEmbeddings({
    apiKey: process.env.HUGGINGFACE_API_KEY,
    model: "sentence-transformers/all-MiniLM-L6-v2",
  });
}

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 800,
  chunkOverlap: 150,
});

const getPineconeIndex = () => {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
    return null;
  }
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    return pc.index(process.env.PINECONE_INDEX_NAME);
  } catch (err) {
    console.warn("[RAG] Pinecone init failed:", err.message);
    return null;
  }
};

const indexNote = async (noteId, text) => {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME || !embeddings) {
    console.log("[RAG] Note saved to MongoDB. (Vector indexing skipped - optional keys not configured)");
    return 0;
  }

  try {
    const docs = await splitter.createDocuments([text], [{ noteId }]);
    const pineconeIndex = getPineconeIndex();
    if (!pineconeIndex) return 0;

    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex,
      namespace: `note_${noteId}`,
    });

    console.log(`[RAG] Indexed ${docs.length} chunks for note ${noteId}`);
    return docs.length;
  } catch (err) {
    console.warn(`[RAG] Vector indexing failed for note ${noteId}:`, err.message);
    return 0;
  }
};

const getRetriever = async (noteId) => {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME || !embeddings) {
    return null;
  }

  try {
    const pineconeIndex = getPineconeIndex();
    if (!pineconeIndex) return null;

    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace: `note_${noteId}`,
    });

    return vectorStore.asRetriever({ k: 3 });
  } catch (err) {
    console.warn(`[RAG] Vector retriever lookup failed for note ${noteId}:`, err.message);
    return null;
  }
};

module.exports = {
  indexNote,
  getRetriever,
};