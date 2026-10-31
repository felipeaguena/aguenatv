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

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'local-users.json');

// Hash Bcrypt de 10 rounds para a senha '1652'
export const DEFAULT_ADMIN_PASSWORD_HASH = '$2b$10$gT5gcyYViuAZ3ovYI/rNoeDR/mQNPgDx7ZdJVWsejJqghgOJc9wo6';

export const INITIAL_DEFAULT_ADMIN: LocalUserRecord = {
  id: '00000000-0000-0000-0000-000000000001',
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
  return users.find((u) => u.username.toLowerCase().trim() === clean) || null;
}

export async function findLocalUserById(id: string): Promise<LocalUserRecord | null> {
  const users = await getLocalUsers();
  return users.find((u) => u.id === id) || null;
}
