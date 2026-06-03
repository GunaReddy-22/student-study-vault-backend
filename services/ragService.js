require("dotenv").config();

const { HuggingFaceInferenceEmbeddings } =
  require("@langchain/community/embeddings/hf");

const { PineconeStore } =
  require("@langchain/pinecone");

const {
  Pinecone,
} = require("@pinecone-database/pinecone");

const {
  RecursiveCharacterTextSplitter,
} = require("@langchain/textsplitters");

const embeddings =
  new HuggingFaceInferenceEmbeddings({
    apiKey: process.env.HUGGINGFACE_API_KEY,
    model:
      "sentence-transformers/all-MiniLM-L6-v2",
  });

console.log(
  "HF KEY EXISTS:",
  !!process.env.HUGGINGFACE_API_KEY
);

const splitter =
  new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  });

const getPineconeIndex = () => {
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  return pc.index(
    process.env.PINECONE_INDEX_NAME
  );
  console.log(
  "PINECONE INDEX:",
  process.env.PINECONE_INDEX_NAME
);

console.log(
  "PINECONE KEY EXISTS:",
  !!process.env.PINECONE_API_KEY
);
};

const indexNote = async (
  noteId,
  text
) => {
  const docs =
    await splitter.createDocuments(
      [text],
      [{ noteId }]
    );

  const pineconeIndex =
    getPineconeIndex();

  await PineconeStore.fromDocuments(
    docs,
    embeddings,
    {
      pineconeIndex,
      namespace: `note_${noteId}`,
    }
  );

  console.log(
    `Indexed ${docs.length} chunks for note ${noteId}`
  );
  console.log(
  "INDEX NOTE ID:",
  noteId
);

  return docs.length;
};

const getRetriever = async (
  noteId
) => {
  const pineconeIndex =
    getPineconeIndex();

  const vectorStore =
    await PineconeStore.fromExistingIndex(
      embeddings,
      {
        pineconeIndex,
        namespace: `note_${noteId}`,
      }
    );

  console.log(
    "PINECONE NAMESPACE:",
    `note_${noteId}`
  );
  console.log(
  "SEARCH NOTE ID:",
  noteId
);

  return vectorStore.asRetriever({
    k: 3,
  });
};

module.exports = {
  indexNote,
  getRetriever,
};