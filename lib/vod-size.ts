import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface VodSizeResult {
  bytes: number;
  approximate: boolean;
}

interface CachedVodSizeEntry {
  bytes: number;
  approximate: boolean;
  timestamp: number;
}

const CACHE_PREFIX = 'aguenatv_vod_size_v1_';
const POSITIVE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas
const NEGATIVE_TTL_MS = 1000 * 60 * 30; // 30 minutos para falhas/HEAD bloqueado

/**
 * Formata bytes para exibição amigável (ex: "1.45 GB" ou "~820 MB").
 */
export function formatVodSize(bytes: number, approximate = false): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Sob demanda';
  const prefix = approximate ? '~' : '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${prefix}${(mb / 1024).toFixed(2)} GB`;
  }
  return `${prefix}${Math.max(1, Math.round(mb))} MB`;
}

/**
 * Converte strings de duração ("01:42:15", "45:10", "95 min", número) para segundos.
 */
export function parseDurationToSeconds(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw !== 'string') return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p.trim()));
    if (parts.every((p) => Number.isFinite(p) && p >= 0)) {
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
  }

  const minMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (minMatch) {
    return Number(minMatch[1]) * 60;
  }

  return 0;
}

/**
 * Converte valores brutos de tamanho (bytes numéricos ou strings tipo "1.4 GB", "850 MB", "1458928372") em bytes.
 */
function parseSizeToBytes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 1024) {
    return Math.round(raw);
  }
  if (typeof raw !== 'string') return 0;
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 1024 ? num : 0;
  }

  const unitMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(gb|mb|kb|b)$/i);
  if (unitMatch) {
    const value = Number(unitMatch[1].replace(',', '.'));
    const unit = unitMatch[2].toLowerCase();
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (unit === 'gb') return Math.round(value * 1024 * 1024 * 1024);
    if (unit === 'mb') return Math.round(value * 1024 * 1024);
    if (unit === 'kb') return Math.round(value * 1024);
    return value > 1024 ? Math.round(value) : 0;
  }

  return 0;
}

/**
 * Extrai tamanho exato (se informado) ou estimado (via bitrate + duração) de respostas JSON do Xtream Codes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractSizeFromXtreamPayload(payload: any, fallbackDurationSeconds = 0): VodSizeResult | null {
  if (!payload || typeof payload !== 'object') return null;

  const info = payload.info && typeof payload.info === 'object' ? payload.info : payload;
  const movieData = payload.movie_data && typeof payload.movie_data === 'object' ? payload.movie_data : {};

  // 1. Campos explícitos de tamanho em bytes
  const explicitCandidates = [
    payload.size,
    payload.filesize,
    payload.file_size,
    payload.bytes,
    info?.size,
    info?.filesize,
    info?.file_size,
    info?.bytes,
    info?.video?.tags?.NUMBER_OF_BYTES,
    info?.video?.tags?.['NUMBER_OF_BYTES-eng'],
    movieData?.size,
    movieData?.filesize,
    movieData?.file_size,
  ];

  for (const candidate of explicitCandidates) {
    const parsedBytes = parseSizeToBytes(candidate);
    if (parsedBytes > 0) {
      return { bytes: parsedBytes, approximate: false };
    }
  }

  // 2. Estimativa por bitrate + duração (kbps/bps * segundos / 8)
  const rawBitrate = Number(
    info?.bitrate ?? movieData?.bitrate ?? info?.video?.bit_rate ?? payload?.bitrate ?? 0
  );
  if (!Number.isFinite(rawBitrate) || rawBitrate <= 0) {
    return null;
  }

  const durationSecs =
    parseDurationToSeconds(info?.duration_secs ?? payload?.duration_secs) ||
    parseDurationToSeconds(info?.duration ?? payload?.duration) ||
    fallbackDurationSeconds;

  if (!Number.isFinite(durationSecs) || durationSecs <= 0) {
    return null;
  }

  // Xtream costuma enviar `bitrate` em kbps (ex: 2450), enquanto ffprobe `bit_rate` vem em bps (ex: 2450000)
  const bps = rawBitrate > 100_000 ? rawBitrate : rawBitrate * 1000;
  const estimatedBytes = Math.round((bps / 8) * durationSecs);
  if (estimatedBytes <= 1024) return null;

  return { bytes: estimatedBytes, approximate: true };
}

export function getCachedVodSizeEntry(cacheKey: string): CachedVodSizeEntry | null {
  if (typeof window === 'undefined' || !cacheKey) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedVodSizeEntry;
    if (!parsed || typeof parsed.timestamp !== 'number') return null;

    const ttl = parsed.bytes > 0 ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
    if (Date.now() - parsed.timestamp > ttl) {
      localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedVodSizeEntry(cacheKey: string, result: VodSizeResult): void {
  if (typeof window === 'undefined' || !cacheKey) return;
  try {
    const entry: CachedVodSizeEntry = {
      bytes: result.bytes,
      approximate: result.approximate,
      timestamp: Date.now(),
    };
    localStorage.setItem(`${CACHE_PREFIX}${cacheKey}`, JSON.stringify(entry));
  } catch {
    // Ignora cota de localStorage
  }
}

function readContentLengthHeader(headers: Record<string, string> | undefined): number {
  if (!headers) return 0;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'content-length') {
      const n = Number(String(v).trim());
      if (Number.isFinite(n) && n > 1024) return Math.round(n);
    }
  }
  return 0;
}

function readLocationHeader(headers: Record<string, string> | undefined): string | null {
  if (!headers) return null;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'location' && typeof v === 'string' && v.trim()) {
      return v.trim();
    }
  }
  return null;
}

/**
 * Executa um único HEAD direto pelo IP do dispositivo via CapacitorHttp no APK Android.
 * Deve ser chamado apenas sequencialmente antes de abrir o player, nunca em paralelo com o stream.
 */
export async function probeVodSizeViaCapacitorHead(streamUrl: string, timeoutMs = 1000): Promise<number | null> {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return null;
  if (!streamUrl || streamUrl.toLowerCase().includes('.m3u8')) return null;

  const runSingleHead = async (targetUrl: string) => {
    const res = await CapacitorHttp.request({
      url: targetUrl,
      method: 'HEAD',
      headers: {
        'User-Agent': 'IPTVSmarters/1.0',
        Accept: '*/*',
      },
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    return res;
  };

  try {
    const timeoutGuard = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs + 250);
    });

    const probeTask = (async (): Promise<number | null> => {
      let res = await runSingleHead(streamUrl);
      // Segue até 1 redirecionamento cross-scheme (ex: http -> https) se o CDN devolver 301/302
      if (res && res.status >= 300 && res.status < 400) {
        const nextUrl = readLocationHeader(res.headers);
        if (nextUrl && /^https?:\/\//i.test(nextUrl)) {
          res = await runSingleHead(nextUrl);
        }
      }
      if (!res || res.status < 200 || res.status >= 400) return null;
      const cl = readContentLengthHeader(res.headers);
      return cl > 0 ? cl : null;
    })();

    return await Promise.race([probeTask, timeoutGuard]);
  } catch {
    return null;
  }
}
