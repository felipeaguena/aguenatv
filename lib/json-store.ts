import fs from 'fs/promises';
import path from 'path';

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
} as const;

const fileMutexes = new Map<string, Promise<void>>();

export function runWithFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const current = fileMutexes.get(key) || Promise.resolve();
  const next = current.then(fn, fn);
  fileMutexes.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

export async function readJsonFileSafe<T>(
  filePath: string,
  fallback: T,
  backupPath?: string
): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as T;
    if (backupPath && Array.isArray(parsed) && parsed.length > 0) {
      fs.writeFile(backupPath, raw, 'utf-8').catch(() => {});
    }
    return parsed;
  } catch {
    if (backupPath) {
      try {
        const bkpRaw = await fs.readFile(backupPath, 'utf-8');
        return JSON.parse(bkpRaw) as T;
      } catch {}
    }
    return fallback;
  }
}

export async function writeJsonFileAtomic(
  filePath: string,
  data: unknown,
  backupPath?: string
): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const content = JSON.stringify(data, null, 2);
    const tmpFile = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fs.writeFile(tmpFile, content, 'utf-8');
    await fs.rename(tmpFile, filePath);

    if (backupPath && Array.isArray(data) && data.length > 0) {
      await fs.writeFile(backupPath, content, 'utf-8').catch(() => {});
    }
  } catch (err) {
    console.warn(`[json-store] Erro ao gravar ${path.basename(filePath)}:`, err);
  }
}
