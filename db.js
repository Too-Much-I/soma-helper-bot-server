const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'faq.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

function getAll() {
  return db.prepare('SELECT key, value FROM faqs ORDER BY key').all();
}

function getByKey(key) {
  return db.prepare('SELECT value FROM faqs WHERE key = ?').get(key);
}

function upsert(key, value) {
  db.prepare('INSERT INTO faqs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function remove(key) {
  const result = db.prepare('DELETE FROM faqs WHERE key = ?').run(key);
  return result.changes > 0;
}

module.exports = { getAll, getByKey, upsert, remove };
