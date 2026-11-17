import { createClient, Client } from '@libsql/client';
import fs from 'fs/promises';
import path from 'path';

const url = process.env.TURSO_DATABASE_URL || '';
const authToken = process.env.TURSO_AUTH_TOKEN || '';

export const isTursoConfigured = (): boolean => {
  return Boolean(
    process.env.TURSO_DATABASE_URL &&
      process.env.TURSO_AUTH_TOKEN &&
      !process.env.TURSO_DATABASE_URL.includes('placeholder')
  );
};

// Cliente oficial do Turso para Edge e Node.js
export const turso: Client = createClient({
  url: isTursoConfigured() ? url : 'http://127.0.0.1:8080',
  authToken: authToken,
});

// Auto-inicialização transparente do esquema de banco de dados (Padrão SaaS multi-usuário)
let schemaInitPromise: Promise<void> | null = null;

async function migrateTableToCompositePrimaryKey(
  tableName: 'continue_watching' | 'user_playlists',
  createNewSql: string,
  columns: string
): Promise<void> {
  try {
    const info = await turso.execute({
      sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
      args: [tableName],
    });
    const ddl = String(info.rows[0]?.sql || '');
    if (!ddl || /PRIMARY KEY\s*\(\s*user_id\s*,\s*id\s*\)/i.test(ddl)) {
      return;
    }

    const tmpName = `${tableName}_v2_tmp`;
    await turso.executeMultiple(`
      DROP TABLE IF EXISTS ${tmpName};
      ${createNewSql.replace(`TABLE IF NOT EXISTS ${tableName}`, `TABLE ${tmpName}`)};
      INSERT OR IGNORE INTO ${tmpName} (${columns}) SELECT ${columns} FROM ${tableName};
      DROP TABLE ${tableName};
      ALTER TABLE ${tmpName} RENAME TO ${tableName};
    `);
  } catch (err) {
    console.warn(`[Turso] Aviso ao migrar PK composta de ${tableName}:`, err);
  }
}

async function importLocalJsonDataOnce(): Promise<void> {
  if (process.env.VERCEL) return;

  try {
    const mig = await turso.execute({
      sql: `SELECT id FROM schema_migrations WHERE id = 'v1_local_json_import' LIMIT 1`,
      args: [],
    });
    if (mig.rows.length > 0) return;

    const dataDir = path.join(process.cwd(), 'data');

    // 1. Usuários locais -> app_users
    try {
      const rawUsers = await fs.readFile(path.join(dataDir, 'local-users.json'), 'utf-8');
      const users = JSON.parse(rawUsers);
      if (Array.isArray(users)) {
        for (const u of users) {
          if (!u?.id || !u?.username || !u?.password_hash) continue;
          await turso.execute({
            sql: `INSERT OR IGNORE INTO app_users (id, username, password_hash, display_name, role, is_active, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              String(u.id),
              String(u.username).toLowerCase().trim(),
              String(u.password_hash),
              String(u.display_name || u.username),
              u.role === 'admin' ? 'admin' : 'user',
              u.is_active === false ? 0 : 1,
              u.created_at || new Date().toISOString(),
              u.updated_at || u.created_at || new Date().toISOString(),
            ],
          });
        }
      }
    } catch {}

    // 2. Favoritos locais -> favorites
    try {
      const rawFav = await fs.readFile(path.join(dataDir, 'local-favorites.json'), 'utf-8');
      const favs = JSON.parse(rawFav);
      if (Array.isArray(favs)) {
        for (const f of favs) {
          if (!f?.user_id || !f?.stream_id || !f?.stream_type || !f?.title) continue;
          await turso.execute({
            sql: `INSERT OR IGNORE INTO favorites (id, user_id, stream_id, stream_type, title, poster_url, category_name, rating, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              String(f.id || `fav_${f.user_id}_${f.stream_type}_${f.stream_id}`),
              String(f.user_id),
              String(f.stream_id),
              String(f.stream_type),
              String(f.title),
              f.poster_url || null,
              f.category_name || null,
              f.rating ? String(f.rating) : null,
              f.created_at || new Date().toISOString(),
            ],
          });
        }
      }
    } catch {}

    // 3. Assistidos locais -> watched_items
    try {
      const rawWat = await fs.readFile(path.join(dataDir, 'local-watched.json'), 'utf-8');
      const watched = JSON.parse(rawWat);
      if (Array.isArray(watched)) {
        for (const w of watched) {
          if (!w?.user_id || !w?.stream_id || !w?.stream_type || !w?.title) continue;
          await turso.execute({
            sql: `INSERT OR IGNORE INTO watched_items (id, user_id, stream_id, stream_type, title, poster_url, category_name, rating, progress_seconds, is_completed, watched_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              String(w.id || `watched_${w.user_id}_${w.stream_type}_${w.stream_id}`),
              String(w.user_id),
              String(w.stream_id),
              String(w.stream_type),
              String(w.title),
              w.poster_url || null,
              w.category_name || null,
              w.rating ? String(w.rating) : null,
              Number(w.progress_seconds) || 0,
              w.is_completed === false ? 0 : 1,
              w.watched_at || new Date().toISOString(),
            ],
          });
        }
      }
    } catch {}

    // 4. Continue Assistindo locais -> continue_watching
    try {
      const rawCw = await fs.readFile(path.join(dataDir, 'local-continue-watching.json'), 'utf-8');
      const cwItems = JSON.parse(rawCw);
      if (Array.isArray(cwItems)) {
        for (const c of cwItems) {
          if (!c?.user_id || !c?.id || !c?.stream_id || !c?.stream_type) continue;
          await turso.execute({
            sql: `INSERT OR IGNORE INTO continue_watching (
                    id, user_id, stream_id, stream_type, title,
                    poster_url, backdrop_url, category_name,
                    series_id, series_title, episode_id, episode_num, season_num, episode_title,
                    current_time, duration, progress_percentage, last_watched_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              String(c.id),
              String(c.user_id),
              String(c.stream_id),
              String(c.stream_type),
              String(c.title || 'Título'),
              c.poster_url || null,
              c.backdrop_url || null,
              c.category_name || null,
              c.series_id ? String(c.series_id) : null,
              c.series_title || null,
              c.episode_id ? String(c.episode_id) : null,
              c.episode_num !== undefined ? Number(c.episode_num) : null,
              c.season_num !== undefined ? Number(c.season_num) : null,
              c.episode_title || null,
              Number(c.current_time) || 0,
              Number(c.duration) || 0,
              Number(c.progress_percentage) || 0,
              c.last_watched_at || new Date().toISOString(),
            ],
          });
        }
      }
    } catch {}

    // 5. Playlists locais -> user_playlists
    try {
      const rawPl = await fs.readFile(path.join(dataDir, 'local-playlists.json'), 'utf-8');
      const playlistsByUser = JSON.parse(rawPl);
      if (playlistsByUser && typeof playlistsByUser === 'object') {
        for (const [uid, lists] of Object.entries(playlistsByUser)) {
          if (!Array.isArray(lists)) continue;
          for (const pl of lists) {
            if (!pl?.id || !pl?.server_url || !pl?.username || !pl?.password) continue;
            await turso.execute({
              sql: `INSERT OR IGNORE INTO user_playlists (
                      id, user_id, name, server_url, username, password, is_active,
                      created_at, updated_at, last_synced, channels_count, movies_count, series_count
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              args: [
                String(pl.id),
                String(uid),
                String(pl.name || 'Lista'),
                String(pl.server_url),
                String(pl.username),
                String(pl.password),
                pl.is_active ? 1 : 0,
                pl.created_at || new Date().toISOString(),
                pl.updated_at || new Date().toISOString(),
                pl.last_synced || null,
                pl.channels_count || null,
                pl.movies_count || null,
                pl.series_count || null,
              ],
            });
          }
        }
      }
    } catch {}

    await turso.execute({
      sql: `INSERT OR IGNORE INTO schema_migrations (id) VALUES ('v1_local_json_import')`,
      args: [],
    });
  } catch (err) {
    console.warn('[Turso] Aviso na importação inicial dos JSONs locais:', err);
  }
}

export async function ensureTursoSchema(): Promise<void> {
  if (!isTursoConfigured()) return;

  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      try {
        const createContinueSql = `
          CREATE TABLE IF NOT EXISTS continue_watching (
            id TEXT NOT NULL,
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
            last_watched_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, id)
          )
        `;

        const createPlaylistsSql = `
          CREATE TABLE IF NOT EXISTS user_playlists (
            id TEXT NOT NULL,
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
            series_count INTEGER,
            PRIMARY KEY (user_id, id)
          )
        `;

        await turso.executeMultiple(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT DEFAULT (datetime('now'))
          );

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

          ${createContinueSql};
          ${createPlaylistsSql};

          INSERT OR IGNORE INTO app_users (id, username, password_hash, display_name, role, is_active)
          VALUES (
            '00000000-0000-0000-0000-000000000001',
            'felipeaguena',
            '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6',
            'Felipe Aguena',
            'admin',
            1
          );
        `);

        // Colunas adicionais em instalações legadas do Turso
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

        // Garante PK composta (user_id, id) em tabelas antigas do Turso para evitar colisões entre usuários
        await migrateTableToCompositePrimaryKey(
          'continue_watching',
          createContinueSql,
          'id, user_id, stream_id, stream_type, title, poster_url, backdrop_url, category_name, series_id, series_title, episode_id, episode_num, season_num, episode_title, current_time, duration, progress_percentage, last_watched_at'
        );
        await migrateTableToCompositePrimaryKey(
          'user_playlists',
          createPlaylistsSql,
          'id, user_id, name, server_url, username, password, is_active, created_at, updated_at, last_synced, channels_count, movies_count, series_count'
        );

        await turso.executeMultiple(`
          CREATE INDEX IF NOT EXISTS idx_user_playlists_user ON user_playlists(user_id);
          CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
          CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username);
          CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
          CREATE INDEX IF NOT EXISTS idx_watched_user_id ON watched_items(user_id);
          CREATE INDEX IF NOT EXISTS idx_continue_watching_user ON continue_watching(user_id, last_watched_at);
        `);

        // Importa dados legados dos arquivos JSON locais uma única vez ao ativar o Turso
        await importLocalJsonDataOnce();
      } catch (err) {
        console.warn('[Turso] Aviso ao verificar/inicializar esquema do banco:', err);
      }
    })();
  }

  return schemaInitPromise;
}
