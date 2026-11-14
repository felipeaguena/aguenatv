const CLUSTER_MIRROR_DOMAINS = ['rootdns.cc', 'dfpump.top', 'zonaverde.sbs'] as const;

/**
 * Normaliza a URL base de um servidor IPTV/Xtream, removendo sufixos comuns
 * caso o usuário tenha colado o link completo (ex: /player_api.php, /get.php?...).
 */
export function normalizeIPTVServerBase(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const cleanPath = parsed.pathname
      .replace(/\/(player_api|get|xmltv)\.php.*$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${cleanPath}`;
  } catch {
    return trimmed
      .replace(/\/(player_api|get|xmltv)\.php.*$/i, '')
      .split('?')[0]
      .replace(/\/+$/, '');
  }
}

export function isClusterMirrorHost(hostUrl: string): boolean {
  const lower = hostUrl.toLowerCase();
  return CLUSTER_MIRROR_DOMAINS.some((domain) => lower.includes(domain));
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
  );
}

/**
 * Extrai a URL base de streaming anunciada em `server_info` pela API Xtream Codes,
 * ignorando endereços internos/privados inválidos.
 */
export function extractStreamHostFromServerInfo(serverInfo: unknown): string | null {
  if (!serverInfo || typeof serverInfo !== 'object') return null;
  const info = serverInfo as Record<string, unknown>;
  const rawHost = typeof info.url === 'string' ? info.url.trim() : '';
  if (!rawHost || isPrivateOrLocalHostname(rawHost)) return null;

  const protoRaw = typeof info.server_protocol === 'string' ? info.server_protocol.toLowerCase() : 'http';
  const proto = protoRaw === 'https' ? 'https' : 'http';
  const rawPort =
    proto === 'https'
      ? info.https_port
      : info.port;
  const portStr = rawPort !== undefined && rawPort !== null ? String(rawPort).trim() : '';
  const omitPort =
    !portStr ||
    (proto === 'http' && portStr === '80') ||
    (proto === 'https' && portStr === '443');

  const candidate = rawHost.startsWith('http://') || rawHost.startsWith('https://')
    ? rawHost
    : `${proto}://${rawHost}${omitPort ? '' : `:${portStr}`}`;

  return normalizeIPTVServerBase(candidate) || null;
}

/**
 * Retorna a lista ordenada de hosts candidatos (original + espelhos do cluster)
 * para comunicação resiliente com a API e streams IPTV.
 */
export function getIPTVMirrorHosts(
  serverUrl: string,
  options: { isHttpsPage?: boolean; includeHttpsFallback?: boolean } = {}
): string[] {
  const clean = normalizeIPTVServerBase(serverUrl);
  if (!clean) return [];

  const { isHttpsPage = false, includeHttpsFallback = false } = options;
  const hosts: string[] = [];
  const pushUnique = (h: string) => {
    const normalized = normalizeIPTVServerBase(h);
    if (normalized && !hosts.includes(normalized)) {
      hosts.push(normalized);
    }
  };

  if (isHttpsPage) {
    if (isClusterMirrorHost(clean)) {
      if (clean.startsWith('https://')) pushUnique(clean);
      pushUnique('https://rootdns.cc');
      return hosts;
    }
    if (clean.startsWith('http://')) {
      pushUnique(clean.replace('http://', 'https://'));
    } else {
      pushUnique(clean);
    }
    return hosts;
  }

  pushUnique(clean);

  // Variações de porta :80 para servidores Xtream atrás de Cloudflare/proxy reverso
  try {
    const parsed = new URL(clean);
    if (parsed.port === '80') {
      pushUnique(`${parsed.protocol}//${parsed.hostname}`);
    } else if (!parsed.port && parsed.protocol === 'http:' && clean.includes('dfpump.top')) {
      pushUnique(`http://${parsed.hostname}:80`);
    }
  } catch {}

  if (isClusterMirrorHost(clean)) {
    // Prioriza espelhos operacionais do cluster quando o domínio principal oscila
    for (const domain of ['dfpump.top', 'zonaverde.sbs', 'rootdns.cc']) {
      pushUnique(`http://${domain}`);
    }
    if (includeHttpsFallback) {
      pushUnique('https://rootdns.cc');
    }
  }

  return hosts;
}

/**
 * Constrói a lista priorizada de hosts para streaming, colocando o host ativo
 * validado anteriormente (cachedWorkingHost) no topo.
 */
export function getOrderedStreamHosts(
  serverUrl: string,
  cachedWorkingHost?: string | null,
  options: { isHttpsPage?: boolean } = {}
): string[] {
  const { isHttpsPage = false } = options;
  const result: string[] = [];
  const pushUnique = (h: string | null | undefined) => {
    if (!h) return;
    const normalized = normalizeIPTVServerBase(h);
    if (!normalized) return;
    if (isHttpsPage && normalized.startsWith('http://')) return;
    if (!result.includes(normalized)) {
      result.push(normalized);
    }
  };

  pushUnique(cachedWorkingHost);
  for (const h of getIPTVMirrorHosts(serverUrl, { isHttpsPage, includeHttpsFallback: false })) {
    pushUnique(h);
  }
  return result;
}
