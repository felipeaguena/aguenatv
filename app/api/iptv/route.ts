import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

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
  const username = searchParams.get('username');
  const password = searchParams.get('password');
  const action = searchParams.get('action');
  const categoryId = searchParams.get('category_id');
  const seriesId = searchParams.get('series_id');
  const vodId = searchParams.get('vod_id');

  if (!host || !username || !password) {
    return NextResponse.json(
      { error: 'Host, username e password do IPTV são obrigatórios' },
      { status: 400 }
    );
  }

  // 1. Limpeza e normalização do Host
  // Se o usuário colou a URL completa do M3U com get.php no host, extrai apenas o protocolo + host + porta
  try {
    if (host.includes('/get.php') || host.includes('/player_api.php')) {
      const parsedUrl = new URL(host);
      host = `${parsedUrl.protocol}//${parsedUrl.host}`;
    }
  } catch {
    // Mantém o host original caso ocorra erro no parser
  }

  let cleanHost = host.replace(/\/+$/, '');

  const buildUrl = (targetHost: string) => {
    let url = `${targetHost}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    if (action) url += `&action=${encodeURIComponent(action)}`;
    if (categoryId) url += `&category_id=${encodeURIComponent(categoryId)}`;
    if (seriesId) url += `&series_id=${encodeURIComponent(seriesId)}`;
    if (vodId) url += `&vod_id=${encodeURIComponent(vodId)}`;
    return url;
  };

  const headers = {
    'User-Agent': 'IPTVSmarters/1.0',
    Accept: '*/*',
  };

  try {
    let targetUrl = buildUrl(cleanHost);
    let upstreamRes = await fetch(targetUrl, {
      headers,
      next: { revalidate: 300 },
    });

    // Auto-recuperação de porta: Se a porta 80 ou default falhar com 404/502, tenta automaticamente na porta 8080
    if (!upstreamRes.ok && (cleanHost.includes(':80') || !cleanHost.match(/:\d+$/))) {
      const fallbackHost = cleanHost.includes(':80')
        ? cleanHost.replace(':80', ':8080')
        : `${cleanHost}:8080`;

      console.log(`[Proxy IPTV] Tentativa de fallback para ${fallbackHost}...`);
      const fallbackUrl = buildUrl(fallbackHost);
      const fallbackRes = await fetch(fallbackUrl, {
        headers,
        next: { revalidate: 300 },
      });

      if (fallbackRes.ok) {
        upstreamRes = fallbackRes;
        cleanHost = fallbackHost;
      }
    }

    if (!upstreamRes.ok) {
      return NextResponse.json(
        {
          error: `Erro no servidor IPTV upstream: ${upstreamRes.status}. Verifique se a porta do servidor está correta (ex: tente :8080).`,
        },
        { status: upstreamRes.status }
      );
    }

    const data = await upstreamRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro no proxy IPTV:', error);
    return NextResponse.json(
      { error: 'Falha na comunicação com o servidor IPTV. Verifique o endereço e conexão.' },
      { status: 502 }
    );
  }
}
