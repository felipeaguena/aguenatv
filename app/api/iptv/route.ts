import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isSafePublicUrl } from '@/lib/security';
import { getIPTVMirrorHosts } from '@/lib/iptv-mirrors';
import zlib from 'zlib';

// Permite execução estendida na Vercel (até 60s) para sincronização de grandes listas IPTV
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Autenticação obrigatória para acessar o proxy
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let host = searchParams.get('host');
  let username = searchParams.get('username');
  let password = searchParams.get('password');
  const action = searchParams.get('action');
  const categoryId = searchParams.get('category_id');
  const seriesId = searchParams.get('series_id');
  const vodId = searchParams.get('vod_id');

  // Parser inteligente: Se o host fornecido for uma URL M3U completa (ex: contendo get.php ou query params)
  if (host && (host.includes('get.php') || host.includes('username=') || host.includes('player_api.php'))) {
    try {
      const parsedUrl = new URL(host);
      if (!username) username = parsedUrl.searchParams.get('username');
      if (!password) password = parsedUrl.searchParams.get('password');
      // Preserva exatamente a porta digitada pelo usuário (ex: http://dfpump.top:80)
      const portPart = parsedUrl.port ? `:${parsedUrl.port}` : '';
      host = `${parsedUrl.protocol}//${parsedUrl.hostname}${portPart}`;
    } catch {
      // Mantém o host original caso ocorra falha de parse
    }
  }

  if (!host || !username || !password) {
    return NextResponse.json(
      { error: 'Host, username e password do IPTV são obrigatórios' },
      { status: 400 }
    );
  }

  // Preserva estritamente a porta digitada pelo usuário sem remover
  const cleanHost = host.trim().replace(/\/+$/, '');

  // Proteção contra SSRF: bloqueia requisições a loopbacks, redes privadas ou metadados de nuvem
  if (!isSafePublicUrl(cleanHost)) {
    return NextResponse.json(
      { error: 'Endereço de servidor IPTV inválido ou restrito por segurança' },
      { status: 400 }
    );
  }

  const buildUrl = (targetHost: string) => {
    let url = `${targetHost}/player_api.php?username=${encodeURIComponent(username!)}&password=${encodeURIComponent(password!)}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (categoryId) url += `&category_id=${encodeURIComponent(categoryId)}`;
    if (seriesId) url += `&series_id=${encodeURIComponent(seriesId)}`;
    if (vodId) url += `&vod_id=${encodeURIComponent(vodId)}`;
    return url;
  };

  // Monta lista de hosts candidatos para tentar de forma resiliente, SEMPRE priorizando a porta informada pelo usuário
  const candidateHosts = getIPTVMirrorHosts(cleanHost, { includeHttpsFallback: true });

  const userAgents = [
    'IPTVSmarters/1.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'VLC/3.0.18 LibVLC/3.0.18',
  ];

  let finalBody: string | null = null;
  let resolvedCandidate: string | null = null;
  let lastError: Error | null = null;
  let lastStatus: number | null = null;
  let sawCloudflareOriginError: number | null = null;
  let sawAuthError: number | null = null;

  for (const candidate of candidateHosts) {
    if (finalBody !== null) break;

    for (const ua of userAgents) {
      try {
        const targetUrl = buildUrl(candidate);
        const upstreamRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': ua,
            Accept: '*/*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000), // Timeout otimizado de 8 segundos por tentativa
        });

        if (upstreamRes.ok) {
          const text = await upstreamRes.text();
          if (text && !text.trim().startsWith('<')) {
            finalBody = text;
            resolvedCandidate = candidate;
            break;
          }
          lastError = new Error(`Resposta HTML inesperada em ${candidate}`);
          lastStatus = 502;
          break; // HTML em 200 OK -> tenta próximo host espelho
        } else {
          lastStatus = upstreamRes.status;
          lastError = new Error(`HTTP ${upstreamRes.status} em ${candidate} (${upstreamRes.statusText})`);

          if (upstreamRes.status >= 520 && upstreamRes.status <= 526) {
            sawCloudflareOriginError = upstreamRes.status;
            break; // Tenta próximo espelho antes de abortar
          }

          if (upstreamRes.status === 401) {
            sawAuthError = 401;
            break; // Tenta próximo espelho antes de concluir que a conta foi recusada
          }

          if (upstreamRes.status === 403) {
            sawAuthError = 403;
            // Se não for bloqueio Cloudflare, outros UAs raramente resolvem neste host; testa próximo UA apenas se cf-ray presente
            if (!upstreamRes.headers.get('cf-ray')) {
              break;
            }
            continue;
          }

          break; // Outro status de erro -> pula para o próximo host candidato
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        break; // Erro de rede ou timeout, tenta próximo host
      }
    }
  }

  if (finalBody === null) {
    console.error('[Proxy IPTV] Todos os candidatos falharam:', candidateHosts, lastError);
    if (sawCloudflareOriginError) {
      return NextResponse.json(
        {
          error: `O servidor do seu provedor IPTV está temporariamente inacessível (Erro Cloudflare ${sawCloudflareOriginError} - Servidor de origem desligado ou em manutenção). Aguarde o restabelecimento pelo provedor.`,
          status: sawCloudflareOriginError,
        },
        { status: 502 }
      );
    }
    if (sawAuthError === 401 || sawAuthError === 403) {
      return NextResponse.json(
        {
          error: `Conexão recusada pelo provedor IPTV (HTTP ${sawAuthError}). Verifique se sua lista está ativa ou se outro aparelho já está conectado simultaneamente (limite de 1 tela atingido).`,
          status: sawAuthError,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        error: `Falha na comunicação com o servidor IPTV (${lastError?.message || `status ${lastStatus || 'desconhecido'}`}). Verifique o endereço e conexão.`,
      },
      { status: 502 }
    );
  }

  try {
    // Comprime com Gzip para contornar o limite rígido de payload de 4.5MB da Vercel
    // Listas de 15MB de filmes caem para apenas ~1.1MB comprimidas e o navegador descompacta automaticamente
    const gzippedBuffer = zlib.gzipSync(Buffer.from(finalBody, 'utf-8'));

    return new NextResponse(gzippedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...(resolvedCandidate
          ? {
              'X-IPTV-Resolved-Host': resolvedCandidate,
              'Access-Control-Expose-Headers': 'X-IPTV-Resolved-Host',
            }
          : {}),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Erro ao transferir dados do IPTV: ${msg}` },
      { status: 502 }
    );
  }
}
