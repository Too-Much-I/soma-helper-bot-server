const axios = require('axios');

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function getEmbeddingInput(faq) {
  return `질문: ${faq.key}\n답변: ${faq.value}`;
}

async function createEmbedding(input) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
  }

  const res = await axios.post(
    OPENAI_EMBEDDING_URL,
    {
      model: EMBEDDING_MODEL,
      input,
      encoding_format: 'float',
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return res.data.data[0].embedding;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return -Infinity;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return -Infinity;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = { createEmbedding, cosineSimilarity, getEmbeddingInput };
