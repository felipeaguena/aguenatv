import { turso, isTursoConfigured, ensureTursoSchema } from './turso';
import fs from 'fs/promises';
import path from 'path';

export interface BlockedIpRecord {
  ip: string;
  attempts: number;
  blockedUntil: string | null;
  isBlocked: boolean;
  remainingMinutes: number;
  lastAttempt: string;
}

interface AttemptData {
  attempts: number;
  blockedUntil: number | null;
  lastAttempt: number;
}

// Limiar de tentativas para acionar o primeiro bloqueio (5 tentativas falhas)
export const MAX_ATTEMPTS = 5;

// Cache em memória de alta performance
const memoryRateLimit = new Map<string, AttemptData>();

const DATA_DIR = path.join(process.cwd(), 'data');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'local-rate-limits.json');

/**
 * Calcula o tempo progressivo de bloqueio baseado no número de tentativas falhas:
 * - 5 a 7 falhas: 15 minutos
 * - 8 a 10 falhas: 1 hora (60 minutos)
 * - 11 a 15 falhas: 6 horas (360 minutos)
 * - >15 falhas: 24 horas (1440 minutos)
 */
export function calculateProgressiveLockoutMs(attempts: number): number {
  if (attempts < MAX_ATTEMPTS) return 0;
  if (attempts <= 7) return 15 * 60 * 1000; // 15 min
  if (attempts <= 10) return 60 * 60 * 1000; // 1 hora
  if (attempts <= 15) return 6 * 60 * 60 * 1000; // 6 horas
  return 24 * 60 * 60 * 1000; // 24 horas
}

// Persistência local em disco para resiliência offline e restarts
async function getLocalFileAttempts(): Promise<Record<string, { attempts: number; blockedUntil: string | null; lastAttempt: string }>> {
  try {
    const raw = await fs.readFile(RATE_LIMIT_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveLocalFileAttempts(data: Record<string, { attempts: number; blockedUntil: string | null; lastAttempt: string }>): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(RATE_LIMIT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[RateLimit] Aviso ao salvar tentativas no disco local:', err);
  }
}

/**
 * Checa se um determinado IP está sob punição/bloqueio ativo
 */
export async function checkIpBlock(ip: string): Promise<{
  blocked: boolean;
  remainingMinutes?: number;
  attempts: number;
  blockedUntil?: string | null;
}> {
  const cleanIp = ip.trim();
  const now = Date.now();

  // 1. Tentar verificar via Turso se configurado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute({
        sql: 'SELECT failed_attempts, blocked_until FROM login_attempts WHERE ip_address = ?',
        args: [cleanIp],
      });

      const row: any = res.rows[0];
      if (row) {
        const attempts = Number(row.failed_attempts || 0);
        if (row.blocked_until) {
          const blockedUntil = new Date(String(row.blocked_until)).getTime();
          if (now < blockedUntil) {
            const remainingMinutes = Math.max(1, Math.ceil((blockedUntil - now) / (1000 * 60)));
            return {
              blocked: true,
              remainingMinutes,
              attempts,
              blockedUntil: String(row.blocked_until),
            };
          }
        }
        return { blocked: false, attempts };
      }
    } catch (e) {
      console.warn('Erro ao verificar rate limit no Turso, usando fallback local:', e);
    }
  }

  // 2. Fallback de verificação em memória
  const record = memoryRateLimit.get(cleanIp);
  if (record) {
    if (record.blockedUntil && now < record.blockedUntil) {
      const remainingMinutes = Math.max(1, Math.ceil((record.blockedUntil - now) / (1000 * 60)));
      return {
        blocked: true,
        remainingMinutes,
        attempts: record.attempts,
        blockedUntil: new Date(record.blockedUntil).toISOString(),
      };
    }
    return { blocked: false, attempts: record.attempts };
  }

  // 3. Fallback em arquivo JSON local
  const localData = await getLocalFileAttempts();
  const localItem = localData[cleanIp];
  if (localItem) {
    if (localItem.blockedUntil) {
      const blockedUntil = new Date(localItem.blockedUntil).getTime();
      if (now < blockedUntil) {
        const remainingMinutes = Math.max(1, Math.ceil((blockedUntil - now) / (1000 * 60)));
        return {
          blocked: true,
          remainingMinutes,
          attempts: localItem.attempts,
          blockedUntil: localItem.blockedUntil,
        };
      }
    }
    return { blocked: false, attempts: localItem.attempts };
  }

  return { blocked: false, attempts: 0 };
}

/**
 * Registra uma tentativa incorreta e aplica o escalonamento progressivo de bloqueio se atingir 5 ou mais falhas
 */
export async function registerFailedAttempt(ip: string): Promise<{
  blockedNow: boolean;
  remainingMinutes?: number;
  attempts: number;
  durationMinutes?: number;
}> {
  const cleanIp = ip.trim();
  const now = Date.now();

  // 1. Obtém tentativas atuais
  let currentAttempts = 0;
  const existingMem = memoryRateLimit.get(cleanIp);
  if (existingMem) {
    currentAttempts = existingMem.attempts;
  } else {
    const localData = await getLocalFileAttempts();
    if (localData[cleanIp]) {
      currentAttempts = localData[cleanIp].attempts;
    }
  }

  // Incrementa tentativa falha
  currentAttempts += 1;

  let blockedNow = false;
  let remainingMinutes: number | undefined;
  let durationMinutes: number | undefined;
  let blockedUntilMs: number | null = null;

  // A partir de 5 falhas, aciona punição com escalonamento progressivo
  if (currentAttempts >= MAX_ATTEMPTS) {
    const lockoutMs = calculateProgressiveLockoutMs(currentAttempts);
    blockedUntilMs = now + lockoutMs;
    durationMinutes = Math.round(lockoutMs / (1000 * 60));
    remainingMinutes = durationMinutes;
    blockedNow = true;
  }

  // Atualiza cache em memória
  memoryRateLimit.set(cleanIp, {
    attempts: currentAttempts,
    blockedUntil: blockedUntilMs,
    lastAttempt: now,
  });

  const blockedUntilIso = blockedUntilMs ? new Date(blockedUntilMs).toISOString() : null;
  const lastAttemptIso = new Date(now).toISOString();

  // Atualiza arquivo local
  const localData = await getLocalFileAttempts();
  localData[cleanIp] = {
    attempts: currentAttempts,
    blockedUntil: blockedUntilIso,
    lastAttempt: lastAttemptIso,
  };
  await saveLocalFileAttempts(localData);

  // 2. Registro no Turso se configurado
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute({
        sql: `INSERT INTO login_attempts (ip_address, failed_attempts, blocked_until, last_attempt)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(ip_address) DO UPDATE SET
                failed_attempts = excluded.failed_attempts,
                blocked_until = excluded.blocked_until,
                last_attempt = excluded.last_attempt`,
        args: [cleanIp, currentAttempts, blockedUntilIso, lastAttemptIso],
      });
    } catch (e) {
      console.warn('Falha ao persistir falha no Turso:', e);
    }
  }

  return { blockedNow, remainingMinutes, attempts: currentAttempts, durationMinutes };
}

/**
 * Remove todas as punições e tentativas acumuladas de um IP específico (Login com sucesso ou Desbloqueio pelo Admin)
 */
export async function clearIpAttempts(ip: string): Promise<void> {
  const cleanIp = ip.trim();
  memoryRateLimit.delete(cleanIp);

  // Remove do arquivo local
  const localData = await getLocalFileAttempts();
  if (localData[cleanIp]) {
    delete localData[cleanIp];
    await saveLocalFileAttempts(localData);
  }

  // Remove do Turso
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

/**
 * Lista todos os IPs registrados (bloqueados ou com tentativas falhas)
 */
export async function getBlockedIps(): Promise<BlockedIpRecord[]> {
  const now = Date.now();
  const mapResults = new Map<string, BlockedIpRecord>();

  // 1. Coleta do Turso se disponível
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      const res = await turso.execute('SELECT ip_address, failed_attempts, blocked_until, last_attempt FROM login_attempts ORDER BY last_attempt DESC');
      for (const row of res.rows as any[]) {
        const ip = String(row.ip_address);
        const attempts = Number(row.failed_attempts || 0);
        const blockedUntilStr = row.blocked_until ? String(row.blocked_until) : null;
        let isBlocked = false;
        let remainingMinutes = 0;

        if (blockedUntilStr) {
          const blockedUntil = new Date(blockedUntilStr).getTime();
          if (now < blockedUntil) {
            isBlocked = true;
            remainingMinutes = Math.max(1, Math.ceil((blockedUntil - now) / (1000 * 60)));
          }
        }

        mapResults.set(ip, {
          ip,
          attempts,
          blockedUntil: blockedUntilStr,
          isBlocked,
          remainingMinutes,
          lastAttempt: row.last_attempt ? String(row.last_attempt) : new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[RateLimit] Erro ao listar do Turso:', e);
    }
  }

  // 2. Mescla com persistência em arquivo local
  const localData = await getLocalFileAttempts();
  for (const [ip, item] of Object.entries(localData)) {
    if (!mapResults.has(ip)) {
      let isBlocked = false;
      let remainingMinutes = 0;
      if (item.blockedUntil) {
        const blockedUntil = new Date(item.blockedUntil).getTime();
        if (now < blockedUntil) {
          isBlocked = true;
          remainingMinutes = Math.max(1, Math.ceil((blockedUntil - now) / (1000 * 60)));
        }
      }

      mapResults.set(ip, {
        ip,
        attempts: item.attempts,
        blockedUntil: item.blockedUntil,
        isBlocked,
        remainingMinutes,
        lastAttempt: item.lastAttempt,
      });
    }
  }

  // 3. Mescla com itens em memória
  for (const [ip, item] of memoryRateLimit.entries()) {
    if (!mapResults.has(ip)) {
      let isBlocked = false;
      let remainingMinutes = 0;
      let blockedUntilStr: string | null = null;
      if (item.blockedUntil) {
        blockedUntilStr = new Date(item.blockedUntil).toISOString();
        if (now < item.blockedUntil) {
          isBlocked = true;
          remainingMinutes = Math.max(1, Math.ceil((item.blockedUntil - now) / (1000 * 60)));
        }
      }

      mapResults.set(ip, {
        ip,
        attempts: item.attempts,
        blockedUntil: blockedUntilStr,
        isBlocked,
        remainingMinutes,
        lastAttempt: new Date(item.lastAttempt).toISOString(),
      });
    }
  }

  return Array.from(mapResults.values()).sort((a, b) => {
    // Prioriza os que estão ativamente bloqueados no topo
    if (a.isBlocked && !b.isBlocked) return -1;
    if (!a.isBlocked && b.isBlocked) return 1;
    return new Date(b.lastAttempt).getTime() - new Date(a.lastAttempt).getTime();
  });
}

/**
 * Remove punição de um IP específico (alias para clearIpAttempts)
 */
export async function unblockIp(ip: string): Promise<boolean> {
  await clearIpAttempts(ip);
  return true;
}

/**
 * Desbloqueia todos os IPs registrados (limpeza global de punições)
 */
export async function unblockAllIps(): Promise<boolean> {
  memoryRateLimit.clear();

  // Limpa arquivo local
  await saveLocalFileAttempts({});

  // Limpa Turso
  if (isTursoConfigured()) {
    try {
      await ensureTursoSchema();
      await turso.execute('DELETE FROM login_attempts');
    } catch (e) {
      console.warn('Erro ao limpar todos os IPs no Turso:', e);
    }
  }

  return true;
}
