const { createClient } = require('@libsql/client');

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      embedding TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function parseEmbedding(embedding) {
  if (!embedding) return null;
  try {
    return JSON.parse(embedding);
  } catch (_) {
    return null;
  }
}

async function getAll() {
  const result = await client.execute('SELECT id, key, value FROM faqs ORDER BY id');
  return result.rows;
}

async function getByKey(key) {
  const result = await client.execute({
    sql: 'SELECT id, key, value, embedding FROM faqs WHERE key = ?',
    args: [key],
  });
  return result.rows[0] ?? null;
}

async function upsert(key, value) {
  await client.execute({
    sql: 'INSERT INTO faqs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, embedding = NULL',
    args: [key, value],
  });
  return getByKey(key);
}

async function remove(key) {
  const result = await client.execute({
    sql: 'DELETE FROM faqs WHERE key = ?',
    args: [key],
  });
  return result.rowsAffected > 0;
}

async function removeById(id) {
  const result = await client.execute({
    sql: 'DELETE FROM faqs WHERE id = ?',
    args: [id],
  });
  return result.rowsAffected > 0;
}

async function upsertEmbedding(key, embedding) {
  await client.execute({
    sql: 'UPDATE faqs SET embedding = ? WHERE key = ?',
    args: [JSON.stringify(embedding), key],
  });
}

async function getAllWithEmbeddings() {
  const result = await client.execute('SELECT id, key, value, embedding FROM faqs WHERE embedding IS NOT NULL');
  return result.rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      embedding: parseEmbedding(row.embedding),
    }))
    .filter((row) => row.embedding);
}

async function getAllForSearch() {
  const result = await client.execute('SELECT id, key, value, embedding FROM faqs ORDER BY id');
  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    embedding: parseEmbedding(row.embedding),
  }));
}

module.exports = { init, getAll, getByKey, upsert, upsertEmbedding, getAllWithEmbeddings, getAllForSearch, remove, removeById };
