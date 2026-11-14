import {
  normalizeIPTVServerBase,
  extractStreamHostFromServerInfo,
  getIPTVMirrorHosts,
  getOrderedStreamHosts,
  isClusterMirrorHost,
} from './iptv-mirrors';

export {
  normalizeIPTVServerBase,
  getIPTVMirrorHosts,
  getOrderedStreamHosts,
  isClusterMirrorHost,
};

const WORKING_HOST_TTL_MS = 30 * 60 * 1000;
const workingHostMemoryCache = new Map<string, { host: string; ts: number }>();
const inFlightHostResolution = new Map<string, Promise<string | null>>();

function getHostCacheKey(serverUrl: string): string {
  return normalizeIPTVServerBase(serverUrl).toLowerCase();
}

export function getCachedWorkingHost(serverUrl: string): string | null {
  const key = getHostCacheKey(serverUrl);
  if (!key) return null;

  const mem = workingHostMemoryCache.get(key);
  if (mem && Date.now() - mem.ts < WORKING_HOST_TTL_MS) {
    return mem.host;
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(`iptv_active_host_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { host?: string; ts?: number };
        if (parsed.host && parsed.ts && Date.now() - parsed.ts < WORKING_HOST_TTL_MS) {
          workingHostMemoryCache.set(key, { host: parsed.host, ts: parsed.ts });
          return parsed.host;
        }
      }
    } catch {}
  }

  return null;
}

export function setCachedWorkingHost(serverUrl: string, workingHost: string): void {
  const key = getHostCacheKey(serverUrl);
  const cleanWorking = normalizeIPTVServerBase(workingHost);
  if (!key || !cleanWorking) return;

  const entry = { host: cleanWorking, ts: Date.now() };
  workingHostMemoryCache.set(key, entry);

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`iptv_active_host_${key}`, JSON.stringify(entry));
    } catch {}
  }
}

/**
 * Resolve o host seguro para comunicação direta do navegador.
 * Quando a aplicação está rodando em HTTPS (ex: https://aguenatv.vercel.app):
 * - Servidores conhecidos como rootdns.cc, dfpump.top e zonaverde.sbs possuem suporte nativo
 *   a HTTPS com certificado SSL válido da Cloudflare através de https://rootdns.cc.
 * - Isso evita o erro de "Mixed Content" (conteúdo misto) no navegador e contorna
 *   o bloqueio de WAF da Cloudflare (HTTP 403 Forbidden) em IPs de datacenter (Vercel/AWS).
 */
export function getSafeDirectHost(serverUrl: string): string {
  const clean = normalizeIPTVServerBase(serverUrl);
  if (!clean) return '';

  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const candidates = getIPTVMirrorHosts(clean, { isHttpsPage });
  return candidates[0] || clean;
}

/**
 * Retorna o host principal mais confiável para construir URLs de reprodução e download,
 * priorizando o host ativo descoberto dinamicamente via API/espelho.
 */
export function getEffectiveStreamHost(serverUrl: string, overrideWorkingHost?: string | null): string {
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const cached = overrideWorkingHost || getCachedWorkingHost(serverUrl);
  const candidates = getOrderedStreamHosts(serverUrl, cached, { isHttpsPage });
  return candidates[0] || getSafeDirectHost(serverUrl);
}

/**
 * Retorna toda a fila ordenada de hosts candidatos para failover automático no player.
 */
export function getStreamHostCandidates(serverUrl: string, overrideWorkingHost?: string | null): string[] {
  const isHttpsPage = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const cached = overrideWorkingHost || getCachedWorkingHost(serverUrl);
  return getOrderedStreamHosts(serverUrl, cached, { isHttpsPage });
}

export interface FetchIPTVOptions {
  action?: string;
  params?: Record<string, string | number | undefined | null>;
  timeoutMs?: number;
}

/**
 * Busca dados da API Xtream/IPTV com arquitetura resiliente:
 * 1. Tenta PRIMEIRO conexão direta do navegador (Client-Side Fetch), priorizando espelho já validado.
 * 2. Em caso de falha na conexão direta (ex: bloqueio de rede local, CORS ou servidor espelho offline),
 *    faz fallback transparente para o proxy (/api/iptv), que retorna em X-IPTV-Resolved-Host o host vencedor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchIPTVApi<T = any>(
  account: { server_url: string; username: string; password: string },
  options: FetchIPTVOptions = {}
): Promise<T> {
  const { action, params = {}, timeoutMs = 12000 } = options;

  const buildQuery = (baseParams: Record<string, string>) => {
    const q = new URLSearchParams(baseParams);
    if (action) q.set('action', action);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        q.set(k, String(v));
      }
    }
    return q.toString();
  };

  // 1. TENTATIVA DIRETA NO CLIENTE (Navegador)
  if (typeof window !== 'undefined') {
    const isHttpsPage = window.location.protocol === 'https:';
    const cachedHost = getCachedWorkingHost(account.server_url);
    const directCandidates = getOrderedStreamHosts(account.server_url, cachedHost, { isHttpsPage });
    const directHost = directCandidates[0] || getSafeDirectHost(account.server_url);

    if (directHost) {
      const directQuery = buildQuery({
        username: account.username,
        password: account.password,
      });
      const directUrl = `${directHost}/player_api.php?${directQuery}`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(directUrl, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json, text/plain, */*',
          },
        });
        clearTimeout(timer);

        if (res.ok) {
          const text = await res.text();
          if (text && !text.trim().startsWith('<')) {
            try {
              const parsed = JSON.parse(text);
              const advertisedHost = extractStreamHostFromServerInfo(parsed?.server_info);
              setCachedWorkingHost(account.server_url, advertisedHost || directHost);
              return parsed as T;
            } catch {
              // Continua para o proxy se não for JSON válido
            }
          }
        }
      } catch (directErr) {
        console.warn(`[IPTV Client] Busca direta em ${directHost} (${action || 'info'}) falhou. Tentando proxy:`, directErr);
      }
    }
  }

  // 2. FALLBACK VIA PROXY (/api/iptv)
  const proxyQuery = buildQuery({
    host: account.server_url,
    username: account.username,
    password: account.password,
  });
  const proxyUrl = `/api/iptv?${proxyQuery}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Falha na comunicação com o servidor IPTV (Status HTTP ${res.status}). Verifique o endereço e conexão.`);
  }

  const resolvedHeader = res.headers.get('X-IPTV-Resolved-Host');
  const data = await res.json();

  const advertisedHost = extractStreamHostFromServerInfo(data?.server_info);
  const winningHost = resolvedHeader || advertisedHost;
  if (winningHost) {
    setCachedWorkingHost(account.server_url, winningHost);
  }

  return data as T;
}

/**
 * Descobre e memoriza o host de streaming ativo para a conta IPTV (sem consumir conexão de mídia),
 * permitindo que Filmes e TV Ao Vivo também evitem domínios espelho fora do ar já na primeira tentativa.
 */
export async function resolveWorkingStreamHost(account: {
  server_url: string;
  username: string;
  password: string;
}): Promise<string | null> {
  if (!account?.server_url || !account?.username || !account?.password) return null;

  const existing = getCachedWorkingHost(account.server_url);
  if (existing) return existing;

  const key = getHostCacheKey(account.server_url);
  const activePromise = inFlightHostResolution.get(key);
  if (activePromise) return activePromise;

  const task = (async () => {
    try {
      await fetchIPTVApi(account, { timeoutMs: 6000 });
      return getCachedWorkingHost(account.server_url);
    } catch {
      return null;
    } finally {
      inFlightHostResolution.delete(key);
    }
  })();

  inFlightHostResolution.set(key, task);
  return task;
}
