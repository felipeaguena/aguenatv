import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
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

  const buildUrl = (targetHost: string) => {
    let url = `${targetHost}/player_api.php?username=${encodeURIComponent(username!)}&password=${encodeURIComponent(password!)}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (categoryId) url += `&category_id=${encodeURIComponent(categoryId)}`;
    if (seriesId) url += `&series_id=${encodeURIComponent(seriesId)}`;
    if (vodId) url += `&vod_id=${encodeURIComponent(vodId)}`;
    return url;
  };

  // Monta lista de hosts candidatos para tentar de forma resiliente, SEMPRE priorizando a porta informada pelo usuário
  const candidateHosts: string[] = [cleanHost];

  // Auto-espelho inteligente entre rootdns.cc e dfpump.top, incluindo HTTPS seguro
  if (cleanHost.includes('rootdns.cc')) {
    if (!cleanHost.startsWith('https://')) {
      candidateHosts.push('https://rootdns.cc');
    }
    const dfpumpMirror = cleanHost.replace('rootdns.cc', 'dfpump.top');
    if (!candidateHosts.includes(dfpumpMirror)) candidateHosts.push(dfpumpMirror);
  } else if (cleanHost.includes('dfpump.top')) {
    // Se digitou dfpump.top:80, tenta também sem porta explícita (e vice-versa)
    if (cleanHost.includes(':80')) {
      const without80 = cleanHost.replace(':80', '');
      if (!candidateHosts.includes(without80)) candidateHosts.push(without80);
    } else {
      const with80 = cleanHost.replace('dfpump.top', 'dfpump.top:80');
      if (!candidateHosts.includes(with80)) candidateHosts.push(with80);
    }
    const rootdnsMirror = cleanHost.replace('dfpump.top', 'rootdns.cc');
    if (!candidateHosts.includes(rootdnsMirror)) candidateHosts.push(rootdnsMirror);
    if (!candidateHosts.includes('https://rootdns.cc')) candidateHosts.push('https://rootdns.cc');
  } else if (cleanHost.includes('zonaverde.sbs')) {
    if (!candidateHosts.includes('https://rootdns.cc')) candidateHosts.push('https://rootdns.cc');
  }

  const userAgents = [
    'IPTVSmarters/1.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'VLC/3.0.18 LibVLC/3.0.18',
  ];

  let finalResponse: Response | null = null;
  let lastError: any = null;

  for (const candidate of candidateHosts) {
    if (finalResponse) break;

    for (const ua of userAgents) {
      try {
        const targetUrl = buildUrl(candidate);
        const upstreamRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': ua,
            Accept: '*/*',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          cache: 'no-store', // Evita o limite de 2MB do Data Cache da Vercel
          signal: AbortSignal.timeout(35000), // Timeout de 35 segundos
        });

        if (upstreamRes.ok) {
          finalResponse = upstreamRes;
          break;
        } else {
          lastError = new Error(`HTTP ${upstreamRes.status} em ${candidate} (${upstreamRes.statusText})`);
          if (upstreamRes.status !== 403) {
            break; // Se não for 403, pula para o próximo host candidato
          }
        }
      } catch (err: any) {
        lastError = err;
        break; // Erro de rede ou timeout, tenta próximo host
      }
    }
  }

  if (!finalResponse) {
    console.error('[Proxy IPTV] Todos os candidatos falharam:', candidateHosts, lastError);
    return NextResponse.json(
      {
        error: `Falha na comunicação com o servidor IPTV (${lastError?.message || 'conexão recusada/timeout'}). Verifique o endereço e conexão.`,
      },
      { status: 502 }
    );
  }

  try {
    const rawText = await finalResponse.text();

    // Se o servidor upstream retornou HTML (ex: página de erro do Nginx ou desafio Cloudflare)
    if (rawText.trim().startsWith('<')) {
      return NextResponse.json(
        { error: 'O servidor IPTV retornou uma resposta em HTML em vez de dados JSON. O servidor pode estar temporariamente indisponível.' },
        { status: 502 }
      );
    }

    // Comprime com Gzip para contornar o limite rígido de payload de 4.5MB da Vercel
    // Listas de 15MB de filmes caem para apenas ~1.1MB comprimidas e o navegador descompacta automaticamente
    const gzippedBuffer = zlib.gzipSync(Buffer.from(rawText, 'utf-8'));

    return new NextResponse(gzippedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Erro ao transferir dados do IPTV: ${err?.message}` },
      { status: 502 }
    );
  }
}
