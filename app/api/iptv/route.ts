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
      host = parsedUrl.origin;
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

  let cleanHost = host.trim().replace(/\/+$/, '');

  const buildUrl = (targetHost: string) => {
    let url = `${targetHost}/player_api.php?username=${encodeURIComponent(username!)}&password=${encodeURIComponent(password!)}`;
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

  // Monta lista de hosts candidatos para tentar de forma resiliente
  const candidateHosts: string[] = [cleanHost];

  // Se cleanHost tiver porta 80 explícita em http, adiciona candidato limpo sem :80
  if (cleanHost.includes(':80') && !cleanHost.includes(':8080')) {
    const without80 = cleanHost.replace(':80', '');
    if (!candidateHosts.includes(without80)) candidateHosts.push(without80);
  }

  // Se for http, tenta também versão https (caso o servidor suporte Cloudflare SSL)
  if (cleanHost.startsWith('http://') && !cleanHost.includes(':8080')) {
    const httpsCandidate = cleanHost.replace('http://', 'https://').replace(':80', '');
    if (!candidateHosts.includes(httpsCandidate)) candidateHosts.push(httpsCandidate);
  }

  // Se o host já tiver :8080 e falhar, tenta também sem :8080
  if (cleanHost.includes(':8080')) {
    const without8080 = cleanHost.replace(':8080', '');
    if (!candidateHosts.includes(without8080)) candidateHosts.push(without8080);
  }

  let finalResponse: Response | null = null;
  let lastError: any = null;

  for (const candidate of candidateHosts) {
    try {
      const targetUrl = buildUrl(candidate);
      const upstreamRes = await fetch(targetUrl, {
        headers,
        cache: 'no-store', // Evita o limite de 2MB do Data Cache da Vercel para listas grandes
        signal: AbortSignal.timeout(45000), // Timeout de 45 segundos
      });

      if (upstreamRes.ok) {
        finalResponse = upstreamRes;
        break;
      } else {
        lastError = new Error(`HTTP ${upstreamRes.status} (${upstreamRes.statusText})`);
      }
    } catch (err: any) {
      lastError = err;
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
        { error: 'O servidor IPTV retornou uma resposta em HTML em vez de dados JSON. O servidor pode estar indisponível ou bloqueando a requisição.' },
        { status: 502 }
      );
    }

    return new NextResponse(rawText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
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
