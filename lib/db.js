const Database = require('better-sqlite3');
const path = require('path'); const fs = require('fs');
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const d = new Database(path.join(dir, 'deckroom.db'));
d.pragma('journal_mode = WAL'); d.pragma('foreign_keys = ON');
d.exec(`
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT, version INTEGER, pages INTEGER, ratio REAL, created_at INTEGER, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, investor_name TEXT, investor_email TEXT, firm TEXT, doc_ids TEXT,
  require_email INTEGER DEFAULT 1, verify_email INTEGER DEFAULT 0, allow_download INTEGER DEFAULT 0, watermark INTEGER DEFAULT 1, password_hash TEXT,
  expires_at INTEGER, allow_emails TEXT, block_emails TEXT, block_domains TEXT, notify INTEGER DEFAULT 1, cta_url TEXT, cta_label TEXT, message TEXT,
  active INTEGER DEFAULT 1, created_at INTEGER);
CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, link_id TEXT REFERENCES links(id) ON DELETE CASCADE, email TEXT, name TEXT, device TEXT,
  verified INTEGER DEFAULT 0, forwarded INTEGER DEFAULT 0, first_seen INTEGER, last_seen INTEGER);
CREATE INDEX IF NOT EXISTS ix_vis_link ON visitors(link_id, email);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, link_id TEXT REFERENCES links(id) ON DELETE CASCADE, visitor_id TEXT REFERENCES visitors(id) ON DELETE CASCADE,
  started_at INTEGER, last_ping INTEGER, duration INTEGER DEFAULT 0, ip TEXT, country TEXT, city TEXT, device TEXT, referrer TEXT);
CREATE INDEX IF NOT EXISTS ix_sess_vis ON sessions(visitor_id);
CREATE TABLE IF NOT EXISTS page_time (session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE, doc_id TEXT, page INTEGER, ms INTEGER DEFAULT 0, views INTEGER DEFAULT 1,
  PRIMARY KEY (session_id, doc_id, page));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT, visitor_id TEXT REFERENCES visitors(id) ON DELETE CASCADE, doc_id TEXT, page INTEGER, body TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id TEXT, visitor_id TEXT, type TEXT, meta TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS otps (link_id TEXT, email TEXT, code TEXT, expires_at INTEGER, name TEXT, PRIMARY KEY (link_id, email));
CREATE TABLE IF NOT EXISTS investors (email TEXT PRIMARY KEY, name TEXT, firm TEXT, stage TEXT, notes TEXT, updated_at INTEGER);
`);
module.exports = {
  raw: d,
  get: (sql, ...a) => d.prepare(sql).get(...a),
  all: (sql, ...a) => d.prepare(sql).all(...a),
  run: (sql, ...a) => d.prepare(sql).run(...a),
  tx: (fn) => d.transaction(fn),
};
