import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export interface VideoStreamStats {
  sizeBytes?: number;
  sizeMB?: number;
  sizeFormatted?: string;
  duration?: number;
  durationFormatted?: string;
  dimensions?: string;
  codec?: string;
  bitrate?: string;
  isLive?: boolean;
}

const statsCache = new Map<string, { stats: VideoStreamStats; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 2; // 2 horas

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const streamUrl = searchParams.get('url');

  if (!streamUrl) {
    return NextResponse.json({ error: 'URL do stream é obrigatória' }, { status: 400 });
  }

  // Verifica cache em memória para resposta instantânea
  const cached = statsCache.get(streamUrl);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.stats, {
      headers: { 'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=3600' },
    });
  }

  const isM3u8 = streamUrl.toLowerCase().includes('.m3u8');
  const stats: VideoStreamStats = {
    isLive: isM3u8,
  };

  const headers = {
    'User-Agent': 'IPTVSmarters/1.0',
    Accept: '*/*',
  };

  try {
    if (isM3u8) {
      // Para streams HLS (.m3u8), lê as primeiras linhas da playlist master para extrair bitrate e codecs
      const res = await fetch(streamUrl, {
        headers,
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const text = await res.text();

        // Resolução: RESOLUTION=1920x1080
        const resMatch = text.match(/RESOLUTION=(\d+x\d+)/i);
        if (resMatch) {
          stats.dimensions = resMatch[1];
        }

        // Codecs: CODECS="avc1.640028,mp4a.40.2"
        const codecMatch = text.match(/CODECS="([^"]+)"/i);
        if (codecMatch) {
          const rawCodecs = codecMatch[1].toLowerCase();
          const parts: string[] = [];
          if (rawCodecs.includes('avc') || rawCodecs.includes('h264')) {
            parts.push('H.264');
          } else if (rawCodecs.includes('hvc') || rawCodecs.includes('hev') || rawCodecs.includes('h265')) {
            parts.push('H.265 (HEVC)');
          } else if (rawCodecs.includes('av01')) {
            parts.push('AV1');
          }

          if (rawCodecs.includes('mp4a') || rawCodecs.includes('aac')) {
            parts.push('AAC');
          } else if (rawCodecs.includes('ac-3') || rawCodecs.includes('ac3')) {
            parts.push('AC3');
          } else if (rawCodecs.includes('ec-3') || rawCodecs.includes('eac3')) {
            parts.push('E-AC3');
          }

          stats.codec = parts.length > 0 ? parts.join(' / ') : codecMatch[1];
        } else {
          stats.codec = 'H.264 / AAC';
        }

        // Bitrate: BANDWIDTH=4500000
        const bwMatch = text.match(/BANDWIDTH=(\d+)/i);
        if (bwMatch) {
          const bps = Number(bwMatch[1]);
          stats.bitrate = `${(bps / 1000000).toFixed(1)} Mbps`;
        }

        stats.sizeFormatted = stats.bitrate ? `${stats.bitrate} (Ao Vivo)` : 'Fluxo Contínuo';
      }
    } else {
      // Para arquivos de vídeo VOD (MP4, MKV)
      let contentLength = 0;

      // 1. Tenta HEAD request leve
      try {
        const headRes = await fetch(streamUrl, {
          method: 'HEAD',
          headers,
          signal: AbortSignal.timeout(3500),
        });

        if (headRes.ok) {
          const cl = headRes.headers.get('content-length');
          if (cl) contentLength = Number(cl);
        }
      } catch (e) {
        // Fallback
      }

      // 2. Se HEAD não retornou Content-Length, tenta requisição parcial GET Range: bytes=0-0
      if (!contentLength || isNaN(contentLength)) {
        try {
          const rangeRes = await fetch(streamUrl, {
            method: 'GET',
            headers: {
              ...headers,
              Range: 'bytes=0-0',
            },
            signal: AbortSignal.timeout(3500),
          });

          // O servidor CDN retorna Content-Range: bytes 0-0/1458928372
          const cr = rangeRes.headers.get('content-range');
          if (cr) {
            const match = cr.match(/\/(\d+)$/);
            if (match) {
              contentLength = Number(match[1]);
            }
          }
          if (!contentLength) {
            const cl = rangeRes.headers.get('content-length');
            if (cl && Number(cl) > 1000) contentLength = Number(cl);
          }
        } catch (e) {}
      }

      if (contentLength && contentLength > 0) {
        stats.sizeBytes = contentLength;
        const mb = Number((contentLength / (1024 * 1024)).toFixed(1));
        stats.sizeMB = mb;
        if (mb >= 1024) {
          stats.sizeFormatted = `${(mb / 1024).toFixed(2)} GB (${Math.round(mb)} MB)`;
        } else {
          stats.sizeFormatted = `${Math.round(mb)} MB`;
        }
      }

      // Codec padrão de arquivos VOD de IPTV
      stats.codec = 'H.264 (AVC) / AAC';
    }

    statsCache.set(streamUrl, { stats, timestamp: Date.now() });
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.warn('[Video Info] Falha ao extrair estatísticas do stream:', err);
    return NextResponse.json(stats);
  }
}
