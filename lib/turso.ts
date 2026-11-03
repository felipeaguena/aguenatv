import { createClient, Client } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL || '';
const authToken = process.env.TURSO_AUTH_TOKEN || '';

export const isTursoConfigured = (): boolean => {
  return Boolean(
    process.env.TURSO_DATABASE_URL &&
    process.env.TURSO_AUTH_TOKEN &&
    !process.env.TURSO_DATABASE_URL.includes('placeholder')
  );
};

// Cliente oficial do Turso para a Edge e Node.js
export const turso: Client = createClient({
  url: isTursoConfigured() ? url : 'http://127.0.0.1:8080',
  authToken: authToken,
});

// Auto-inicialização transparente do esquema de banco de dados
let schemaInitPromise: Promise<void> | null = null;

export async function ensureTursoSchema(): Promise<void> {
  if (!isTursoConfigured()) return;

  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      try {
        await turso.executeMultiple(`
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
            poster_url TEXT,
            category_name TEXT,
            rating TEXT,
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
            series_id TEXT,
            series_title TEXT,
            episode_id TEXT,
            episode_num INTEGER,
            season_num INTEGER,
            episode_title TEXT,
            current_time REAL DEFAULT 0,
            duration REAL DEFAULT 0,
            progress_percentage REAL DEFAULT 0,
            last_watched_at TEXT DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS user_playlists (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            server_url TEXT NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            is_active INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            last_synced INTEGER,
            channels_count INTEGER,
            movies_count INTEGER,
            series_count INTEGER
          );

          CREATE INDEX IF NOT EXISTS idx_user_playlists_user ON user_playlists(user_id);
          CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
          CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
          CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
          CREATE INDEX IF NOT EXISTS idx_watched_user_id ON watched_items(user_id);
          CREATE INDEX IF NOT EXISTS idx_continue_watching_user ON continue_watching(user_id, last_watched_at);

          INSERT OR IGNORE INTO app_users (id, username, password_hash, display_name, role, is_active)
          VALUES (
            '00000000-0000-0000-0000-000000000001',
            'felipeaguena',
            '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6',
            'Felipe Aguena',
            'admin',
            1
          );

          UPDATE app_users
          SET username = 'felipeaguena',
              display_name = 'Felipe Aguena',
              password_hash = '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6'
          WHERE id = '00000000-0000-0000-0000-000000000001' AND username = 'admin';
        `);

        // Migração de colunas adicionais e isolamento para felipeaguena
        try {
          await turso.execute('ALTER TABLE watched_items ADD COLUMN poster_url TEXT;');
        } catch {}
        try {
          await turso.execute('ALTER TABLE watched_items ADD COLUMN category_name TEXT;');
        } catch {}
        try {
          await turso.execute('ALTER TABLE watched_items ADD COLUMN rating TEXT;');
        } catch {}
        try {
          await turso.execute('ALTER TABLE continue_watching ADD COLUMN series_title TEXT;');
        } catch {}

        // Migra registros legados ('me', 'local_user', etc.) para o usuário felipeaguena
        try {
          await turso.executeMultiple(`
            UPDATE favorites SET user_id = '00000000-0000-0000-0000-000000000001' 
            WHERE user_id IN ('me', 'local_user', 'admin') OR user_id IS NULL;

            UPDATE watched_items SET user_id = '00000000-0000-0000-0000-000000000001' 
            WHERE user_id IN ('me', 'local_user', 'admin') OR user_id IS NULL;

            UPDATE continue_watching SET user_id = '00000000-0000-0000-0000-000000000001' 
            WHERE user_id IN ('me', 'local_user', 'admin') OR user_id IS NULL;

            UPDATE user_playlists SET user_id = '00000000-0000-0000-0000-000000000001' 
            WHERE user_id IN ('me', 'local_user', 'admin') OR user_id IS NULL;
          `);
        } catch {}
      } catch (err) {
        console.warn('[Turso] Aviso ao verificar/inicializar esquema do banco:', err);
      }
    })();
  }

  return schemaInitPromise;
}
