CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  is_guest INTEGER NOT NULL DEFAULT 1,
  song_play_count INTEGER NOT NULL DEFAULT 0,
  bind_prompted_at INTEGER,
  bind_dismissed_until INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE liked_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  track_data TEXT NOT NULL,
  liked_at INTEGER NOT NULL,
  UNIQUE(user_id, video_id)
);

CREATE INDEX idx_liked_songs_user ON liked_songs(user_id, liked_at DESC);

CREATE TABLE history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  track_data TEXT NOT NULL,
  played_at INTEGER NOT NULL
);

CREATE INDEX idx_history_user ON history(user_id, played_at DESC);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_playlists_user ON playlists(user_id, created_at DESC);

CREATE TABLE playlist_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  track_data TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  UNIQUE(playlist_id, video_id)
);

CREATE INDEX idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, added_at DESC);
