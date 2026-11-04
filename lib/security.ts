/**
 * AGUENATV - Módulo Central de Segurança e Proteção de Rede
 * Defesa contra SSRF, Injeção e Manipulação de Requisições
 */

/**
 * Valida se uma URL externa é pública e segura, bloqueando ataques de SSRF
 * (Server-Side Request Forgery) que tentam acessar a rede interna ou metadados de nuvem.
 */
export function isSafePublicUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== 'string') return false;

  try {
    const parsed = new URL(urlStr);

    // 1. Exige protocolo HTTP ou HTTPS estrito
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // 2. Bloqueia localhost e nomes de domínio da rede local
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.home.arpa')
    ) {
      return false;
    }

    // 3. Bloqueia IPv6 loopback e endereços privados
    if (hostname.startsWith('[') || hostname.includes(':')) {
      const cleanIpv6 = hostname.replace(/[\[\]]/g, '');
      if (
        cleanIpv6 === '::1' ||
        cleanIpv6 === '::' ||
        cleanIpv6.startsWith('fe80:') ||
        cleanIpv6.startsWith('fc') ||
        cleanIpv6.startsWith('fd')
      ) {
        return false;
      }
    }

    // 4. Bloqueia faixas privadas e reservadas de IPv4
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const octets = parts.map((p) => parseInt(p, 10));
      if (octets.some((o) => o < 0 || o > 255)) return false;

      const [o1, o2] = octets;

      // 0.0.0.0/8 (Rede atual)
      if (o1 === 0) return false;

      // 127.0.0.0/8 (Loopback local)
      if (o1 === 127) return false;

      // 10.0.0.0/8 (Privada RFC 1918)
      if (o1 === 10) return false;

      // 172.16.0.0/12 (Privada RFC 1918: 172.16.0.0 a 172.31.255.255)
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false;

      // 192.168.0.0/16 (Privada RFC 1918)
      if (o1 === 192 && o2 === 168) return false;

      // 169.254.0.0/16 (Link-Local / Metadados de Nuvem OCI/AWS/GCP: 169.254.169.254)
      if (o1 === 169 && o2 === 254) return false;

      // 100.64.0.0/10 (Carrier-Grade NAT)
      if (o1 === 100 && o2 >= 64 && o2 <= 127) return false;
    }

    return true;
  } catch {
    return false;
  }
}
