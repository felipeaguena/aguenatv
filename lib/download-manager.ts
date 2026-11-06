import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { localDB } from './db-local';

export interface BackgroundDownloadPluginInterface {
  startDownload(options: { id: string; url: string; title: string; fileName: string }): Promise<{ started: boolean; id: string }>;
  cancelDownload(options: { id: string }): Promise<void>;
  installApk(options: { filePath: string }): Promise<{ success: boolean }>;
  openExternalUrl(options: { url: string }): Promise<{ success: boolean }>;
  addListener(
    eventName: 'progress',
    listenerFunc: (data: { id: string; title: string; bytes: number; contentLength: number; percentage: number }) => void
  ): Promise<any>;
  addListener(
    eventName: 'complete',
    listenerFunc: (data: { id: string; title: string; path: string; size: number; success: boolean; error?: string }) => void
  ): Promise<any>;
}

export const BackgroundDownload = registerPlugin<BackgroundDownloadPluginInterface>('BackgroundDownload');

// Gerenciamento de progresso reativo e global
export const activeDownloadsMap: Record<string, DownloadProgress> = {};
export const activeDownloadTitles: Record<string, string> = {};
export const PROGRESS_EVENT = 'aguenatv_download_progress';

// Inicializa sincronização global nativa para que a UI receba eventos mesmo após reabrir o app
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  try {
    BackgroundDownload.addListener('progress', (data) => {
      const progressData: DownloadProgress = {
        bytesReceived: data.bytes,
        totalBytes: data.contentLength,
        percentage: data.percentage,
      };
      activeDownloadsMap[data.id] = progressData;
      activeDownloadTitles[data.id] = data.title;
      window.dispatchEvent(
        new CustomEvent(PROGRESS_EVENT, {
          detail: { id: data.id, title: data.title, progress: progressData },
        })
      );
    }).catch(() => {});

    BackgroundDownload.addListener('complete', (data) => {
      delete activeDownloadsMap[data.id];
      delete activeDownloadTitles[data.id];
      window.dispatchEvent(
        new CustomEvent(PROGRESS_EVENT, {
          detail: { id: data.id, title: data.title, done: true, success: data.success },
        })
      );
    }).catch(() => {});
  } catch {}
}

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

  // 1. EXECUÇÃO EM APLICATIVO NATIVO (Android / iOS via Foreground Service Nativo Resiliente)
  if (isNativeApp()) {
    // Pede permissão para notificações locais se necessário (Android 13+)
    try {
      const notifPerm = await LocalNotifications.checkPermissions();
      if (notifPerm.display !== 'granted') {
        await LocalNotifications.requestPermissions().catch(() => {});
      }
    } catch {}

    return new Promise<OfflineDownload>(async (resolve, reject) => {
      let progressSub: any = null;
      let completeSub: any = null;

      const cleanup = async () => {
        if (progressSub) {
          try { await progressSub.remove(); } catch {}
        }
        if (completeSub) {
          try { await completeSub.remove(); } catch {}
        }
        delete activeDownloadsMap[cleanId];
        delete activeDownloadTitles[cleanId];
      };

      try {
        progressSub = await BackgroundDownload.addListener('progress', (data: any) => {
          if (data.id !== cleanId) return;

          const progressData: DownloadProgress = {
            bytesReceived: data.bytes,
            totalBytes: data.contentLength,
            percentage: data.percentage,
          };

          activeDownloadsMap[cleanId] = progressData;
          activeDownloadTitles[cleanId] = item.title;

          if (onProgress) {
            onProgress(progressData);
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(PROGRESS_EVENT, {
                detail: { id: cleanId, title: item.title, progress: progressData },
              })
            );
          }
        });

        completeSub = await BackgroundDownload.addListener('complete', async (data: any) => {
          if (data.id !== cleanId) return;

          await cleanup();

          if (data.success) {
            const record: OfflineDownload = {
              id: cleanId,
              stream_id: item.stream_id,
              stream_type: item.stream_type,
              title: item.title,
              series_title: item.series_title,
              poster_url: item.poster_url,
              file_path: data.path || `videos/${fileName}`,
              file_size: data.size || 0,
              downloaded_at: new Date().toISOString(),
              container_extension: extension,
              season_num: item.season_num,
              episode_num: item.episode_num,
              episode_id: item.episode_id,
            };

            if (localDB?.offline_downloads) {
              await localDB.offline_downloads.put(record).catch(() => {});
            }

            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(PROGRESS_EVENT, {
                  detail: { id: cleanId, title: item.title, done: true, success: true },
                })
              );
            }

            resolve(record);
          } else {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(PROGRESS_EVENT, {
                  detail: { id: cleanId, title: item.title, done: true, success: false },
                })
              );
            }
            reject(new Error(data.error || 'Falha no download nativo.'));
          }
        });

        // Inicia o serviço nativo com WakeLock + WifiLock e download HTTP resiliente com retries
        await BackgroundDownload.startDownload({
          id: cleanId,
          url: streamUrl,
          title: item.title,
          fileName: fileName,
        });
      } catch (err: any) {
        await cleanup();
        reject(new Error(`Falha ao iniciar download em segundo plano: ${err.message || 'Erro desconhecido'}`));
      }
    });
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
 * Sincroniza os arquivos físicos salvos no disco do Android com o banco IndexedDB (Dexie).
 * Garante que qualquer vídeo baixado seja contabilizado com o tamanho exato em disco.
 */
export async function syncOfflineDownloadsWithDisk(): Promise<void> {
  if (!localDB?.offline_downloads) return;

  if (isNativeApp()) {
    try {
      // 1. Garante que a pasta videos existe
      try {
        await Filesystem.mkdir({ path: 'videos', directory: Directory.Data, recursive: true });
      } catch {}

      // 2. Lê arquivos existentes no diretório videos
      const dirResult = await Filesystem.readdir({ path: 'videos', directory: Directory.Data });
      const physicalFiles = new Map<string, number>(); // fileName -> size

      for (const f of dirResult.files) {
        const name = typeof f === 'string' ? f : (f as any).name;
        if (!name || !name.startsWith('offline_') || name.endsWith('.tmp')) continue;

        try {
          const stat = await Filesystem.stat({ path: `videos/${name}`, directory: Directory.Data });
          if (stat.size && stat.size > 0) {
            physicalFiles.set(name, stat.size);
          }
        } catch {}
      }

      // 3. Atualiza o banco com os arquivos físicos encontrados
      for (const [fileName, size] of physicalFiles.entries()) {
        const withoutPrefix = fileName.replace(/^offline_/, '');
        const lastDot = withoutPrefix.lastIndexOf('.');
        const cleanId = lastDot !== -1 ? withoutPrefix.substring(0, lastDot) : withoutPrefix;
        const extension = lastDot !== -1 ? withoutPrefix.substring(lastDot + 1) : 'mp4';

        const existing = await localDB.offline_downloads.get(cleanId);
        if (existing) {
          if (existing.file_size !== size) {
            existing.file_size = size;
            await localDB.offline_downloads.put(existing);
          }
        } else {
          const isMovie = cleanId.startsWith('movie_');
          const streamType = isMovie ? 'movie' : 'series';

          let streamId: string | number = cleanId;
          let seasonNum: number | undefined;
          let episodeNum: number | undefined;

          if (isMovie) {
            streamId = cleanId.replace('movie_', '');
          } else {
            const parts = cleanId.split('_');
            streamId = parts[1] || cleanId;
            if (parts[2]?.startsWith('s')) {
              seasonNum = parseInt(parts[2].substring(1), 10);
            }
            if (parts[3]?.startsWith('e')) {
              episodeNum = parseInt(parts[3].substring(1), 10);
            }
          }

          let title = `Vídeo ${streamId}`;
          let posterUrl: string | undefined;

          try {
            const stream = await localDB.streams
              .where('stream_id')
              .equals(String(streamId))
              .first();
            if (stream) {
              title = stream.title || stream.name;
              posterUrl = stream.stream_icon;
            }
          } catch {}

          if (!isMovie && seasonNum && episodeNum) {
            title = `${title} - T${seasonNum}:E${episodeNum}`;
          }

          const newRecord: OfflineDownload = {
            id: cleanId,
            stream_id: streamId,
            stream_type: streamType,
            title,
            series_title: isMovie ? undefined : title.split(' - ')[0],
            poster_url: posterUrl,
            file_path: `videos/${fileName}`,
            file_size: size,
            downloaded_at: new Date().toISOString(),
            container_extension: extension,
            season_num: seasonNum,
            episode_num: episodeNum,
            episode_id: episodeNum,
          };

          await localDB.offline_downloads.put(newRecord);
        }
      }

      // 4. Remove do banco registros cujos arquivos físicos não existem mais
      const allDbRecords = await localDB.offline_downloads.toArray();
      for (const rec of allDbRecords) {
        const filePath = rec.file_path || '';
        const fileName = filePath.includes('/') ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
        if (!physicalFiles.has(fileName)) {
          await localDB.offline_downloads.delete(rec.id);
        }
      }
    } catch (e) {
      console.warn('[DownloadManager] Erro na sincronização com disco:', e);
    }
  }
}

/**
 * Retorna todos os vídeos salvos offline
 */
export async function getOfflineDownloadsList(): Promise<OfflineDownload[]> {
  if (!localDB?.offline_downloads) return [];
  try {
    await syncOfflineDownloadsWithDisk();
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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PROGRESS_EVENT, {
          detail: { id, done: true, deleted: true },
        })
      );
    }
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
