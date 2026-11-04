import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { localDB } from './db-local';

export interface OfflineDownload {
  id: string; // ex: movie_123 ou series_456_e1
  stream_id: string | number;
  stream_type: 'movie' | 'series';
  title: string;
  poster_url?: string;
  file_path: string;
  file_size?: number;
  downloaded_at: string;
  container_extension: string;
  season_num?: number;
  episode_num?: number;
}

export interface DownloadProgress {
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
}

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Inicia o download de um vídeo (filme ou episódio de série) para a memória do celular
 */
export async function downloadVideoForOffline(
  item: {
    stream_id: string | number;
    stream_type: 'movie' | 'series';
    title: string;
    poster_url?: string;
    container_extension?: string;
    season_num?: number;
    episode_num?: number;
  },
  streamUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<OfflineDownload> {
  const extension = item.container_extension || 'mp4';
  const cleanId = `${item.stream_type}_${item.stream_id}${item.episode_num ? `_e${item.episode_num}` : ''}`;
  const fileName = `offline_${cleanId}.${extension}`;

  // 1. EXECUÇÃO EM APLICATIVO NATIVO (Android / iOS via Capacitor)
  if (isNativeApp()) {
    try {
      // Garante permissões de escrita/leitura se necessário
      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== 'granted') {
        await Filesystem.requestPermissions();
      }

      const downloadResult = await Filesystem.downloadFile({
        url: streamUrl,
        path: `videos/${fileName}`,
        directory: Directory.Data,
        recursive: true,
        progress: true,
      });

      // Obtém o tamanho final do arquivo baixado
      let fileSize = 0;
      try {
        const stat = await Filesystem.stat({
          path: `videos/${fileName}`,
          directory: Directory.Data,
        });
        fileSize = stat.size || 0;
      } catch {}

      const record: OfflineDownload = {
        id: cleanId,
        stream_id: item.stream_id,
        stream_type: item.stream_type,
        title: item.title,
        poster_url: item.poster_url,
        file_path: downloadResult.path || `videos/${fileName}`,
        file_size: fileSize,
        downloaded_at: new Date().toISOString(),
        container_extension: extension,
        season_num: item.season_num,
        episode_num: item.episode_num,
      };

      if (localDB?.offline_downloads) {
        await localDB.offline_downloads.put(record);
      }

      return record;
    } catch (err: any) {
      console.error('[DownloadManager] Erro ao baixar no aplicativo nativo:', err);
      throw new Error(`Falha no download nativo: ${err.message || 'Erro desconhecido'}`);
    }
  }

  // 2. FALLBACK PARA NAVEGADOR WEB (Download direto padrão)
  try {
    const a = document.createElement('a');
    a.href = streamUrl;
    a.download = `${item.title.replace(/[^a-zA-Z0-9_\-\s]/g, '')}.${extension}`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    const record: OfflineDownload = {
      id: cleanId,
      stream_id: item.stream_id,
      stream_type: item.stream_type,
      title: item.title,
      poster_url: item.poster_url,
      file_path: streamUrl,
      downloaded_at: new Date().toISOString(),
      container_extension: extension,
      season_num: item.season_num,
      episode_num: item.episode_num,
    };

    return record;
  } catch (webErr: any) {
    throw new Error('Não foi possível iniciar o download no navegador.');
  }
}

/**
 * Retorna todos os vídeos salvos offline
 */
export async function getOfflineDownloadsList(): Promise<OfflineDownload[]> {
  if (!localDB?.offline_downloads) return [];
  try {
    return await localDB.offline_downloads.toArray();
  } catch {
    return [];
  }
}

/**
 * Converte o arquivo local para uma URL que o player de vídeo consegue reproduzir offline
 */
export async function getPlayableOfflineUrl(download: OfflineDownload): Promise<string> {
  if (isNativeApp()) {
    try {
      const uriResult = await Filesystem.getUri({
        path: download.file_path,
        directory: Directory.Data,
      });
      // Converte o caminho nativo de arquivo (file://...) em URL web utilizável pelo WebView
      return Capacitor.convertFileSrc(uriResult.uri);
    } catch {
      return download.file_path;
    }
  }
  return download.file_path;
}

/**
 * Remove um vídeo baixado da memória e do banco de dados
 */
export async function deleteOfflineDownload(id: string): Promise<void> {
  if (!localDB?.offline_downloads) return;

  try {
    const record = await localDB.offline_downloads.get(id);
    if (record && isNativeApp()) {
      try {
        await Filesystem.deleteFile({
          path: record.file_path,
          directory: Directory.Data,
        });
      } catch (e) {
        console.warn('[DownloadManager] Arquivo já não existia no disco:', e);
      }
    }
    await localDB.offline_downloads.delete(id);
  } catch (err) {
    console.error('[DownloadManager] Erro ao excluir vídeo offline:', err);
  }
}
