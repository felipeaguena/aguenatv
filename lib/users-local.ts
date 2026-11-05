import fs from 'fs/promises';
import path from 'path';
import { UserRole } from './types';

export interface LocalUserRecord {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export const DATA_DIR = path.join(process.cwd(), 'data');
export const USERS_FILE = path.join(DATA_DIR, 'local-users.json');
export const FELIPE_AGUENA_USER_ID = '00000000-0000-0000-0000-000000000001';

// Hash Bcrypt inicial para a primeira carga administrativa
export const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6';

export const INITIAL_DEFAULT_ADMIN: LocalUserRecord = {
  id: FELIPE_AGUENA_USER_ID,
  username: 'felipeaguena',
  display_name: 'Felipe Aguena',
  role: 'admin',
  password_hash: DEFAULT_ADMIN_PASSWORD_HASH,
  is_active: true,
  created_at: new Date().toISOString(),
};

export async function getLocalUsers(): Promise<LocalUserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Arquivo ainda não existe, cria com o admin padrão
  }

  const initialList = [INITIAL_DEFAULT_ADMIN];
  await saveLocalUsers(initialList);
  return initialList;
}

export async function saveLocalUsers(users: LocalUserRecord[]): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[LocalUsers] Aviso: erro ao salvar usuários em disco local:', err);
  }
}

export async function findLocalUserByUsername(username: string): Promise<LocalUserRecord | null> {
  const users = await getLocalUsers();
  const clean = username.toLowerCase().trim();
  const found = users.find((u) => u.username.toLowerCase().trim() === clean);
  if (found) return found;

  // Permitir que o usuário acesse digitando "admin" como apelido para o administrador
  if (clean === 'admin') {
    const adminUser = users.find((u) => u.role === 'admin' && u.is_active);
    if (adminUser) return adminUser;
  }

  return null;
}

export async function findLocalUserById(id: string): Promise<LocalUserRecord | null> {
  const users = await getLocalUsers();
  return users.find((u) => u.id === id) || null;
}

// Migração segura para transferir qualquer dado legado desatribuído para felipeaguena
let localMigrationDone = false;
export async function ensureDataMigratedToFelipeAguena(): Promise<void> {
  if (localMigrationDone || process.env.VERCEL) return;
  localMigrationDone = true;

  try {
    // 1. Favoritos
    const favPath = path.join(DATA_DIR, 'local-favorites.json');
    try {
      const raw = await fs.readFile(favPath, 'utf-8');
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        let changed = false;
        const updated = items.map((it: any) => {
          if (!it.user_id || it.user_id === 'me' || it.user_id === 'local_user' || it.user_id === 'admin') {
            changed = true;
            return { ...it, user_id: FELIPE_AGUENA_USER_ID };
          }
          return it;
        });
        if (changed) {
          await fs.writeFile(favPath, JSON.stringify(updated, null, 2), 'utf-8');
        }
      }
    } catch {}

    // 2. Watched / Concluídos
    const watchedPath = path.join(DATA_DIR, 'local-watched.json');
    try {
      const raw = await fs.readFile(watchedPath, 'utf-8');
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        let changed = false;
        const updated = items.map((it: any) => {
          if (!it.user_id || it.user_id === 'me' || it.user_id === 'local_user' || it.user_id === 'admin') {
            changed = true;
            return { ...it, user_id: FELIPE_AGUENA_USER_ID };
          }
          return it;
        });
        if (changed) {
          await fs.writeFile(watchedPath, JSON.stringify(updated, null, 2), 'utf-8');
        }
      }
    } catch {}

    // 3. Continue Watching
    const continuePath = path.join(DATA_DIR, 'local-continue-watching.json');
    try {
      const raw = await fs.readFile(continuePath, 'utf-8');
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        let changed = false;
        const updated = items.map((it: any) => {
          if (!it.user_id || it.user_id === 'me' || it.user_id === 'local_user' || it.user_id === 'admin') {
            changed = true;
            return { ...it, user_id: FELIPE_AGUENA_USER_ID };
          }
          return it;
        });
        if (changed) {
          await fs.writeFile(continuePath, JSON.stringify(updated, null, 2), 'utf-8');
        }
      }
    } catch {}

    // 4. Playlists
    const playlistsPath = path.join(DATA_DIR, 'local-playlists.json');
    try {
      const raw = await fs.readFile(playlistsPath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        let changed = false;
        for (const k of ['default', 'me', 'local_user', 'admin']) {
          if (data[k] && Array.isArray(data[k])) {
            if (!data[FELIPE_AGUENA_USER_ID]) {
              data[FELIPE_AGUENA_USER_ID] = data[k];
            }
            delete data[k];
            changed = true;
          }
        }
        if (changed) {
          await fs.writeFile(playlistsPath, JSON.stringify(data, null, 2), 'utf-8');
        }
      }
    } catch {}
  } catch (err) {
    console.warn('[Migration] Aviso ao migrar dados legados:', err);
  }
}
