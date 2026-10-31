import { turso, isTursoConfigured, ensureTursoSchema } from './turso';

// Cache em memória como fallback para desenvolvimento local ou resiliência
interface AttemptData {
  attempts: number;
  blockedUntil: number | null;
  lastAttempt: number;
}
const memoryRateLimit = new Map<string, AttemptData>();

const MAX_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hora em milissegundos

export async function checkIpBlock(ip: string): Promise<{ blocked: boolean; remainingMinutes?: number }> {
  const cleanIp = ip.trim();

  // 1. Tentar verificar via Turso se configurado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT failed_attempts, blocked_until FROM login_attempts WHERE ip_address = ?',
        args: [cleanIp],
      });

      const row = res.rows[0];
      if (row && row.blocked_until) {
        const blockedUntil = new Date(String(row.blocked_until)).getTime();
        const now = Date.now();

        if (now < blockedUntil) {
          const remainingMinutes = Math.max(1, Math.ceil((blockedUntil - now) / (1000 * 60)));
          return { blocked: true, remainingMinutes };
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar rate limit no Turso, usando fallback em memória:', e);
    }
  }

  // 2. Fallback de verificação em memória
  const record = memoryRateLimit.get(cleanIp);
  if (record && record.blockedUntil) {
    const now = Date.now();
    if (now < record.blockedUntil) {
      const remainingMinutes = Math.max(1, Math.ceil((record.blockedUntil - now) / (1000 * 60)));
      return { blocked: true, remainingMinutes };
    } else {
      // Bloqueio expirou
      memoryRateLimit.delete(cleanIp);
    }
  }

  return { blocked: false };
}

export async function registerFailedAttempt(ip: string): Promise<{ blockedNow: boolean; remainingMinutes?: number }> {
  const cleanIp = ip.trim();
  const now = Date.now();

  // 1. Registro em memória
  const current = memoryRateLimit.get(cleanIp) || { attempts: 0, blockedUntil: null, lastAttempt: now };
  current.attempts += 1;
  current.lastAttempt = now;

  let blockedNow = false;
  let remainingMinutes: number | undefined;

  if (current.attempts >= MAX_ATTEMPTS) {
    current.blockedUntil = now + LOCKOUT_DURATION_MS;
    blockedNow = true;
    remainingMinutes = 60;
  }
  memoryRateLimit.set(cleanIp, current);

  // 2. Registro no Turso se configurado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const blockedUntilDate = blockedNow ? new Date(current.blockedUntil!).toISOString() : null;
      await turso.execute({
        sql: `INSERT INTO login_attempts (ip_address, failed_attempts, blocked_until, last_attempt)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(ip_address) DO UPDATE SET
                failed_attempts = excluded.failed_attempts,
                blocked_until = excluded.blocked_until,
                last_attempt = excluded.last_attempt`,
        args: [cleanIp, current.attempts, blockedUntilDate, new Date(now).toISOString()],
      });
    } catch (e) {
      console.warn('Falha ao persistir falha no Turso:', e);
    }
  }

  return { blockedNow, remainingMinutes };
}

export async function clearIpAttempts(ip: string): Promise<void> {
  const cleanIp = ip.trim();
  memoryRateLimit.delete(cleanIp);

  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute({
        sql: 'DELETE FROM login_attempts WHERE ip_address = ?',
        args: [cleanIp],
      });
    } catch (e) {
      console.warn('Falha ao limpar tentativas no Turso:', e);
    }
  }
}
