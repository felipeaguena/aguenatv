import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { localDB } from './db-local';

export interface BackgroundDownloadPluginInterface {
  startDownload(options: { title: string }): Promise<void>;
  updateProgress(options: { progress: number; subtext: string }): Promise<void>;
  stopDownload(options: { success: boolean; title: string }): Promise<void>;
}

export const BackgroundDownload = registerPlugin<BackgroundDownloadPluginInterface>('BackgroundDownload');

// Gerenciamento de progresso reativo e global
export const activeDownloadsMap: Record<string, DownloadProgress> = {};
export const activeDownloadTitles: Record<string, string> = {};
export const PROGRESS_EVENT = 'aguenatv_download_progress';

export function getActiveDownloadProgress(id: string): DownloadProgress | undefined {
  return activeDownloadsMap[id];
}

export function getAllActiveDownloads(): Record<string, DownloadProgress> {
  return { ...activeDownloadsMap };
}

export function formatDownloadSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export interface OfflineDownload {
  id: string; // ex: movie_123 ou series_456_s1_e2
  stream_id: string | number;
  stream_type: 'movie' | 'series';
  title: string;
  series_title?: string;
  poster_url?: string;
  file_path: string;
  file_size?: number;
  downloaded_at: string;
  container_extension: string;
  season_num?: number;
  episode_num?: number;
  episode_id?: string | number;
}

export interface GroupedDownloadItem {
  stream_id: string | number;
  stream_type: 'movie' | 'series';
  title: string;
  poster_url?: string;
  total_size: number;
  items_count: number;
  episodes: OfflineDownload[];
  last_downloaded_at: string;
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
 * Gera um ID único padronizado para o download
 */
export function buildDownloadId(
  streamType: 'movie' | 'series',
  streamId: string | number,
  seasonNum?: number | string,
  episodeNum?: number | string
): string {
  if (streamType === 'movie') {
    return `movie_${streamId}`;
  }
  const s = seasonNum !== undefined ? `_s${seasonNum}` : '';
  const e = episodeNum !== undefined ? `_e${episodeNum}` : '';
  return `series_${streamId}${s}${e}`;
}

/**
 * Inicia o download de um vídeo (filme ou episódio de série) para a memória do celular
 */
export async function downloadVideoForOffline(
  item: {
    stream_id: string | number;
    stream_type: 'movie' | 'series';
    title: string;
    series_title?: string;
    poster_url?: string;
    container_extension?: string;
    season_num?: number;
    episode_num?: number;
    episode_id?: string | number;
  },
  streamUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<OfflineDownload> {
  const extension = item.container_extension || 'mp4';
  const cleanId = buildDownloadId(
    item.stream_type,
    item.stream_id,
    item.season_num,
    item.episode_num ?? item.episode_id
  );
  const fileName = `offline_${cleanId}.${extension}`;

  // 1. EXECUÇÃO EM APLICATIVO NATIVO (Android / iOS via Capacitor)
  if (isNativeApp()) {
    let listenerHandle: any = null;
    try {
      // Garante permissões se aplicável
      try {
        const perm = await Filesystem.checkPermissions();
        if (perm.publicStorage && perm.publicStorage !== 'granted') {
          await Filesystem.requestPermissions().catch(() => {});
        }
      } catch {}

      // Pede permissão para notificações (Android 13+ requer POST_NOTIFICATIONS)
      try {
        const notifPerm = await LocalNotifications.checkPermissions();
        if (notifPerm.display !== 'granted') {
          await LocalNotifications.requestPermissions().catch(() => {});
        }
      } catch {}

      // Garante que o diretório 'videos' existe antes de iniciar o download
      try {
        await Filesystem.mkdir({
          path: 'videos',
          directory: Directory.Data,
          recursive: true,
        });
      } catch {
        // Ignora se o diretório já existir
      }

      const relativePath = `videos/${fileName}`;

      // Inicia Foreground Service nativo com WakeLock (mantém o download vivo em segundo plano / tela bloqueada)
      try {
        await BackgroundDownload.startDownload({ title: item.title });
      } catch (svcErr) {
        console.warn('[DownloadManager] Não foi possível iniciar ForegroundService:', svcErr);
      }

      // Registra listener de progresso com porcentagem em tempo real
      let lastNotifUpdate = 0;
      try {
        listenerHandle = await Filesystem.addListener('progress', (status) => {
          if (status.url && status.url !== streamUrl) {
            return;
          }

          const total = status.contentLength || 0;
          const current = status.bytes || 0;
          const percentage = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

          const progressData: DownloadProgress = {
            bytesReceived: current,
            totalBytes: total,
            percentage,
          };

          activeDownloadsMap[cleanId] = progressData;
          activeDownloadTitles[cleanId] = item.title;

          if (onProgress) {
            onProgress(progressData);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(PROGRESS_EVENT, {
                detail: {
                  id: cleanId,
                  title: item.title,
                  progress: progressData,
                },
              })
            );
          }

          // Atualiza a notificação do Android com throttle de 1s para poupar CPU
          const now = Date.now();
          if (now - lastNotifUpdate > 1000 || percentage === 100) {
            lastNotifUpdate = now;
            const subtext =
              total > 0
                ? `${formatDownloadSize(current)} / ${formatDownloadSize(total)} (${percentage}%)`
                : `${formatDownloadSize(current)}`;
            BackgroundDownload.updateProgress({ progress: percentage, subtext }).catch(() => {});
          }
        });
      } catch (errListener) {
        console.warn('[DownloadManager] Não foi possível registrar listener de progresso:', errListener);
      }

      let downloadResult;
      try {
        downloadResult = await Filesystem.downloadFile({
          url: streamUrl,
          path: relativePath,
          directory: Directory.Data,
          progress: true,
        });
      } finally {
        if (listenerHandle) {
          try {
            await listenerHandle.remove();
          } catch {}
        }
      }

      // Finaliza o serviço de download nativo com sucesso
      delete activeDownloadsMap[cleanId];
      delete activeDownloadTitles[cleanId];

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(PROGRESS_EVENT, {
            detail: { id: cleanId, title: item.title, done: true, success: true },
          })
        );
      }

      try {
        await BackgroundDownload.stopDownload({ success: true, title: item.title });
      } catch {}

      // Obtém o tamanho final do arquivo baixado
      let fileSize = 0;
      try {
        const stat = await Filesystem.stat({
          path: relativePath,
          directory: Directory.Data,
        });
        fileSize = stat.size || 0;
      } catch {}

      const record: OfflineDownload = {
        id: cleanId,
        stream_id: item.stream_id,
        stream_type: item.stream_type,
        title: item.title,
        series_title: item.series_title,
        poster_url: item.poster_url,
        file_path: downloadResult.path || relativePath,
        file_size: fileSize,
        downloaded_at: new Date().toISOString(),
        container_extension: extension,
        season_num: item.season_num,
        episode_num: item.episode_num,
        episode_id: item.episode_id,
      };

      if (localDB?.offline_downloads) {
        await localDB.offline_downloads.put(record);
      }

      return record;
    } catch (err: any) {
      if (listenerHandle) {
        try {
          await listenerHandle.remove();
        } catch {}
      }
      delete activeDownloadsMap[cleanId];
      delete activeDownloadTitles[cleanId];

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(PROGRESS_EVENT, {
            detail: { id: cleanId, title: item.title, done: true, success: false },
          })
        );
      }

      try {
        await BackgroundDownload.stopDownload({ success: false, title: item.title });
      } catch {}

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
      series_title: item.series_title,
      poster_url: item.poster_url,
      file_path: streamUrl,
      downloaded_at: new Date().toISOString(),
      container_extension: extension,
      season_num: item.season_num,
      episode_num: item.episode_num,
      episode_id: item.episode_id,
    };

    if (localDB?.offline_downloads) {
      await localDB.offline_downloads.put(record);
    }

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
 * Verifica se um item específico já foi baixado
 */
export async function checkIsDownloaded(id: string): Promise<boolean> {
  if (!localDB?.offline_downloads) return false;
  try {
    const found = await localDB.offline_downloads.get(id);
    return !!found;
  } catch {
    return false;
  }
}

/**
 * Retorna itens baixados agrupados por Título / Série (ideal para a aba Favoritos)
 */
export async function getGroupedOfflineDownloads(): Promise<GroupedDownloadItem[]> {
  const all = await getOfflineDownloadsList();
  const map = new Map<string, GroupedDownloadItem>();

  for (const item of all) {
    const groupKey = `${item.stream_type}_${item.stream_id}`;
    const mainTitle = item.series_title || (item.stream_type === 'series' ? item.title.split(' - ')[0] : item.title);

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        stream_id: item.stream_id,
        stream_type: item.stream_type,
        title: mainTitle,
        poster_url: item.poster_url,
        total_size: item.file_size || 0,
        items_count: 1,
        episodes: [item],
        last_downloaded_at: item.downloaded_at,
      });
    } else {
      const existing = map.get(groupKey)!;
      existing.total_size += item.file_size || 0;
      existing.items_count += 1;
      existing.episodes.push(item);
      if (new Date(item.downloaded_at) > new Date(existing.last_downloaded_at)) {
        existing.last_downloaded_at = item.downloaded_at;
      }
    }
  }

  // Ordena episódios de cada série por temporada e episódio
  for (const group of map.values()) {
    if (group.stream_type === 'series') {
      group.episodes.sort((a, b) => {
        const sDiff = (a.season_num || 0) - (b.season_num || 0);
        if (sDiff !== 0) return sDiff;
        return (a.episode_num || 0) - (b.episode_num || 0);
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.last_downloaded_at).getTime() - new Date(a.last_downloaded_at).getTime()
  );
}

/**
 * Converte o arquivo local para uma URL que o player de vídeo consegue reproduzir offline
 */
export async function getPlayableOfflineUrl(download: OfflineDownload): Promise<string> {
  if (isNativeApp()) {
    try {
      // Se o caminho já for absoluto do sistema de arquivos ou file://
      if (download.file_path && (download.file_path.startsWith('/') || download.file_path.startsWith('file://'))) {
        return Capacitor.convertFileSrc(download.file_path);
      }
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
        const filePath = record.file_path;
        const relativePath = filePath.includes('videos/')
          ? filePath.substring(filePath.indexOf('videos/'))
          : filePath;

        await Filesystem.deleteFile({
          path: relativePath,
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

/**
 * Exclui todos os downloads de uma série ou filme completo
 */
export async function deleteGroupDownloads(streamType: 'movie' | 'series', streamId: string | number): Promise<void> {
  if (!localDB?.offline_downloads) return;
  try {
    const items = await localDB.offline_downloads
      .where('stream_id')
      .equals(streamId)
      .filter((i) => i.stream_type === streamType)
      .toArray();

    for (const item of items) {
      await deleteOfflineDownload(item.id);
    }
  } catch (err) {
    console.error('[DownloadManager] Erro ao excluir grupo de downloads:', err);
  }
}
