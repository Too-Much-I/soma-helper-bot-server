const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'faq.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    embedding TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 기존 DB에 embedding 컬럼이 없으면 추가
try {
  db.exec('ALTER TABLE faqs ADD COLUMN embedding TEXT');
} catch (_) {
  // 이미 존재하면 무시
}

function parseEmbedding(embedding) {
  if (!embedding) return null;

  try {
    return JSON.parse(embedding);
  } catch (_) {
    return null;
  }
}

function getAll() {
  return db.prepare('SELECT id, key, value FROM faqs ORDER BY id').all();
}

function getByKey(key) {
  return db.prepare('SELECT id, key, value, embedding FROM faqs WHERE key = ?').get(key);
}

function upsert(key, value) {
  db.prepare('INSERT INTO faqs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, embedding = NULL').run(key, value);
  return getByKey(key);
}

function remove(key) {
  const result = db.prepare('DELETE FROM faqs WHERE key = ?').run(key);
  return result.changes > 0;
}

function removeById(id) {
  const result = db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
  return result.changes > 0;
}

function upsertEmbedding(key, embedding) {
  db.prepare('UPDATE faqs SET embedding = ? WHERE key = ?').run(JSON.stringify(embedding), key);
}

function getAllWithEmbeddings() {
  return db.prepare('SELECT id, key, value, embedding FROM faqs WHERE embedding IS NOT NULL').all().map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    embedding: parseEmbedding(row.embedding),
  })).filter((row) => row.embedding);
}

function getAllForSearch() {
  return db.prepare('SELECT id, key, value, embedding FROM faqs ORDER BY id').all().map((row) => ({
    id: row.id,
    key: row.key,
    value: row.value,
    embedding: parseEmbedding(row.embedding),
  }));
}

module.exports = { getAll, getByKey, upsert, upsertEmbedding, getAllWithEmbeddings, getAllForSearch, remove, removeById };
