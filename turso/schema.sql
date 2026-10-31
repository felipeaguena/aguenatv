-- ========================================================
-- AGUENATV - Esquema de Banco de Dados Oficial (Turso / SQLite)
-- Compatível com libSQL Serverless e Edge Runtime
-- ========================================================

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_address TEXT PRIMARY KEY,
  failed_attempts INTEGER DEFAULT 0,
  blocked_until TEXT,
  last_attempt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  stream_type TEXT NOT NULL CHECK (stream_type IN ('live', 'movie', 'series')),
  title TEXT NOT NULL,
  poster_url TEXT,
  category_name TEXT,
  rating TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, stream_id, stream_type)
);

CREATE TABLE IF NOT EXISTS watched_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  stream_type TEXT NOT NULL CHECK (stream_type IN ('live', 'movie', 'series')),
  title TEXT NOT NULL,
  progress_seconds INTEGER DEFAULT 0,
  is_completed INTEGER DEFAULT 1,
  watched_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, stream_id, stream_type)
);

CREATE TABLE IF NOT EXISTS continue_watching (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  stream_id TEXT NOT NULL,
  stream_type TEXT NOT NULL CHECK (stream_type IN ('live', 'movie', 'series')),
  title TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  category_name TEXT,
  episode_id TEXT,
  episode_num INTEGER,
  season_num INTEGER,
  episode_title TEXT,
  current_time REAL DEFAULT 0,
  duration REAL DEFAULT 0,
  progress_percentage REAL DEFAULT 0,
  last_watched_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_user_id ON watched_items(user_id);
CREATE INDEX IF NOT EXISTS idx_continue_watching_user ON continue_watching(user_id, last_watched_at);

-- Administrador Inicial Padrão (usuário: felipeaguena / senha: 1652)
INSERT OR IGNORE INTO app_users (id, username, password_hash, display_name, role, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'felipeaguena',
  '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6',
  'Felipe Aguena',
  'admin',
  1
);
