-- Admin control panel (/control) support.
-- Reuses the existing D1 database (no new Cloudflare bindings required).

ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN banned_at INTEGER;
ALTER TABLE users ADD COLUMN banned_reason TEXT;

-- Generic key/value store for site-wide settings (currently: maintenance mode).
-- Read on (almost) every request, so keep it a single small table rather than KV,
-- since D1 is already the binding every route has access to.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  publish_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE INDEX idx_announcements_active ON announcements(is_active, publish_at, expires_at);

-- Per-user read state, keyed the same way liked_songs/history are (users.id).
CREATE TABLE announcement_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, announcement_id)
);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_log_time ON admin_audit_log(created_at DESC);
