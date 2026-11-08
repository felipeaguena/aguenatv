import { IPTVAccount } from './types';

/**
 * Resolve o host seguro para comunicação direta do navegador.
 * Quando a aplicação está rodando em HTTPS (ex: https://aguenatv.vercel.app):
 * - Servidores conhecidos como rootdns.cc, dfpump.top e zonaverde.sbs possuem suporte nativo
 *   a HTTPS com certificado SSL válido da Cloudflare através de https://rootdns.cc.
 * - Isso evita o erro de "Mixed Content" (conteúdo misto) no navegador e contorna
 *   o bloqueio de WAF da Cloudflare (HTTP 403 Forbidden) em IPs de datacenter (Vercel/AWS).
 */
export function getSafeDirectHost(serverUrl: string): string {
  const clean = serverUrl.trim().replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (
      clean.includes('rootdns.cc') ||
      clean.includes('dfpump.top') ||
      clean.includes('zonaverde.sbs')
    ) {
      return 'https://rootdns.cc';
    }
    // Se for outro servidor com http://, tenta https se a página estiver em https
    if (clean.startsWith('http://')) {
      return clean.replace('http://', 'https://');
    }
  }

  return clean;
}

export interface FetchIPTVOptions {
  action?: string;
  params?: Record<string, string | number | undefined | null>;
  timeoutMs?: number;
}

/**
 * Busca dados da API Xtream/IPTV com arquitetura resiliente:
 * 1. Tenta PRIMEIRO conexão direta do navegador (Client-Side Fetch):
 *    - Roda a partir do IP residencial/móvel do usuário (Cloudflare libera 100%, sem 403).
 *    - Utiliza CORS nativo e SSL válido da Cloudflare (https://rootdns.cc).
 *    - Bypassa o limite de 4.5MB da Vercel (listas de 15MB de filmes baixam em 1s direto no IndexedDB).
 *    - Sem risco de timeout das serverless functions da Vercel.
 * 2. Em caso de falha na conexão direta (ex: bloqueio de rede local ou servidor privado),
 *    faz fallback transparente para o proxy serverless (/api/iptv).
 */
export async function fetchIPTVApi(
  account: { server_url: string; username: string; password: string },
  options: FetchIPTVOptions = {}
): Promise<any> {
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
    const directHost = getSafeDirectHost(account.server_url);
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

      // Detecção rápida de servidor de origem IPTV fora do ar (Cloudflare 520..526)
      if (res.status >= 520 && res.status <= 526) {
        throw new Error(
          `O servidor do provedor IPTV está temporariamente inacessível (Erro Cloudflare ${res.status} - Servidor de origem fora do ar). Aguarde o provedor restabelecer o serviço.`
        );
      }

      // Detecção de limite de conexões simultâneas ou credencial
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Conexão recusada pelo provedor IPTV (HTTP ${res.status}). Verifique se sua lista está ativa ou se outro aparelho já está conectado simultaneamente (limite de 1 tela atingido).`
        );
      }

      if (res.ok) {
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          try {
            return JSON.parse(text);
          } catch {
            // Continua para o proxy se não for JSON válido
          }
        }
      }
    } catch (directErr) {
      console.warn(`[IPTV Client] Busca direta em ${directHost} (${action || 'info'}) falhou. Tentando proxy:`, directErr);
    }
  }

  // 2. FALLBACK VIA PROXY SERVERLESS (/api/iptv)
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
  return res.json();
}
