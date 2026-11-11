import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { localDB } from './db-local';

export interface BackgroundDownloadPluginInterface {
  startDownload(options: { id: string; url: string; title: string; fileName: string; metadata?: string }): Promise<{ started: boolean; id: string }>;
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

// Chaves de manifesto resiliente offline (Origin-Independent)
export const MANIFEST_FILE_PATH = 'videos/downloads_manifest.json';
export const MANIFEST_STORAGE_KEY = 'aguenatv_offline_downloads_manifest';

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
  backdrop_url?: string;
  thumbnail_url?: string;
  file_path: string;
  file_size?: number;
  downloaded_at: string;
  container_extension: string;
  season_num?: number;
  episode_num?: number;
  episode_id?: string | number;
  overview?: string;
  plot?: string;
  rating?: string | number;
  genre?: string;
  episode_title?: string;
  release_date?: string;
  year?: string | number;
  duration?: string;
  dimensions?: string;
  codec?: string;
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
 * Recupera o cache síncrono de títulos baixados do localStorage ou da bridge nativa do Android para renderização imediata com 0ms
 */
export function getCachedManifestSync(): OfflineDownload[] {
  if (typeof window === 'undefined') return [];
  try {
    // 1. Tenta carregar do AndroidBridge nativo síncrono no APK se disponível
    if ((window as any).AndroidBridge?.getOfflineDownloadsJson) {
      try {
        const nativeJson = (window as any).AndroidBridge.getOfflineDownloadsJson();
        if (nativeJson && nativeJson.trim().length > 2) {
          const parsed = JSON.parse(nativeJson);
          const list: OfflineDownload[] = Array.isArray(parsed) ? parsed : Object.values(parsed);
          if (list && list.length > 0) {
            try {
              localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(list));
            } catch {}
            return list;
          }
        }
      } catch (bridgeErr) {
        console.warn('[DownloadManager] Erro ao ler getOfflineDownloadsJson síncrono:', bridgeErr);
      }
    }

    // 2. Fallback para cache local no localStorage
    const raw = localStorage.getItem(MANIFEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) {
        return Object.values(parsed);
      }
    }
  } catch {}
  return [];
}

/**
 * Lê o manifesto nativo persistido no disco (Directory.Data)
 */
export async function readManifestFromDisk(): Promise<Record<string, OfflineDownload>> {
  const result: Record<string, OfflineDownload> = {};

  // 1. Tenta carregar do localStorage primeiro (acesso rápido)
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(MANIFEST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: OfflineDownload) => {
            if (item?.id) result[item.id] = item;
          });
        } else if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(result, parsed);
        }
      }
    } catch {}
  }

  // 2. Se for app nativo, complementa/revalida com o arquivo físico no disco
  if (isNativeApp()) {
    try {
      const fileData = await Filesystem.readFile({
        path: MANIFEST_FILE_PATH,
        directory: Directory.Data,
      });
      const dataStr = typeof fileData.data === 'string' ? fileData.data : '';
      if (dataStr) {
        const parsedDisk = JSON.parse(dataStr);
        if (typeof parsedDisk === 'object' && parsedDisk !== null) {
          Object.assign(result, parsedDisk);
        }
      }
    } catch {}
  }

  return result;
}

/**
 * Salva o manifesto no disco nativo e no localStorage
 */
export async function writeManifestToDisk(manifest: Record<string, OfflineDownload>): Promise<void> {
  // Salva no localStorage para leitura imediata
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
    } catch {}
  }

  // Salva no disco físico nativo em Directory.Data
  if (isNativeApp()) {
    try {
      try {
        await Filesystem.mkdir({ path: 'videos', directory: Directory.Data, recursive: true });
      } catch {}

      await Filesystem.writeFile({
        path: MANIFEST_FILE_PATH,
        data: JSON.stringify(manifest, null, 2),
        directory: Directory.Data,
        encoding: 'utf8' as any,
      });
    } catch (e) {
      console.warn('[DownloadManager] Falha ao persistir manifesto em disco:', e);
    }
  }
}

/**
 * Adiciona ou atualiza um item no manifesto persistente e salva o companion JSON
 */
export async function saveDownloadToManifest(record: OfflineDownload): Promise<void> {
  try {
    // 1. Salva via AndroidBridge nativo se disponível
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.saveOfflineMetadata) {
      try {
        (window as any).AndroidBridge.saveOfflineMetadata(record.id, JSON.stringify(record));
      } catch {}
    }

    // 2. Salva companion JSON individual (offline_{id}.json) no disco nativo
    if (isNativeApp()) {
      try {
        await Filesystem.writeFile({
          path: `videos/offline_${record.id}.json`,
          data: JSON.stringify(record, null, 2),
          directory: Directory.Data,
          encoding: 'utf8' as any,
        });
      } catch {}
    }

    // 3. Atualiza manifesto principal
    const manifest = await readManifestFromDisk();
    manifest[record.id] = record;
    await writeManifestToDisk(manifest);
  } catch {}
}

/**
 * Remove um item do manifesto persistente e apaga seu companion JSON
 */
export async function removeDownloadFromManifest(id: string): Promise<void> {
  try {
    // 1. Remove via AndroidBridge nativo
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.deleteOfflineVideo) {
      try {
        (window as any).AndroidBridge.deleteOfflineVideo(id, `videos/offline_${id}`);
      } catch {}
    }

    // 2. Remove companion JSON individual
    if (isNativeApp()) {
      try {
        await Filesystem.deleteFile({
          path: `videos/offline_${id}.json`,
          directory: Directory.Data,
        });
      } catch {}
    }

    const manifest = await readManifestFromDisk();
    if (manifest[id]) {
      delete manifest[id];
      await writeManifestToDisk(manifest);
    }
  } catch {}
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
    backdrop_url?: string;
    thumbnail_url?: string;
    container_extension?: string;
    season_num?: number;
    episode_num?: number;
    episode_id?: string | number;
    overview?: string;
    plot?: string;
    rating?: string | number;
    genre?: string;
    episode_title?: string;
    release_date?: string;
    year?: string | number;
    duration?: string;
    dimensions?: string;
    codec?: string;
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

  const initialRecord: OfflineDownload = {
    id: cleanId,
    stream_id: item.stream_id,
    stream_type: item.stream_type,
    title: item.title,
    series_title: item.series_title,
    poster_url: item.poster_url,
    backdrop_url: item.backdrop_url,
    thumbnail_url: item.thumbnail_url,
    file_path: `videos/${fileName}`,
    downloaded_at: new Date().toISOString(),
    container_extension: extension,
    season_num: item.season_num,
    episode_num: item.episode_num,
    episode_id: item.episode_id,
    overview: item.overview,
    plot: item.plot,
    rating: item.rating,
    genre: item.genre,
    episode_title: item.episode_title,
    release_date: item.release_date,
    year: item.year,
    duration: item.duration,
    dimensions: item.dimensions,
    codec: item.codec,
  };

  // 1. EXECUÇÃO EM APLICATIVO NATIVO (Android / iOS via Foreground Service Nativo Resiliente)
  if (isNativeApp()) {
    // Grava preliminarmente os metadados companion JSON no disco do celular
    await saveDownloadToManifest(initialRecord);

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
              ...initialRecord,
              file_path: data.path || `videos/${fileName}`,
              file_size: data.size || 0,
              downloaded_at: new Date().toISOString(),
            };

            if (localDB?.offline_downloads) {
              await localDB.offline_downloads.put(record).catch(() => {});
            }

            // Persiste no manifesto resiliente e no arquivo companion JSON
            await saveDownloadToManifest(record);

            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent(PROGRESS_EVENT, {
                  detail: { id: cleanId, title: item.title, done: true, success: true },
                })
              );
              window.dispatchEvent(
                new CustomEvent('offline-downloads-changed', {
                  detail: { id: cleanId, action: 'added' },
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

        // Inicia o serviço nativo com WakeLock + WifiLock, JSON de metadados e download HTTP resiliente
        await BackgroundDownload.startDownload({
          id: cleanId,
          url: streamUrl,
          title: item.title,
          fileName: fileName,
          metadata: JSON.stringify(initialRecord),
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
      ...initialRecord,
      file_path: streamUrl,
    };

    if (localDB?.offline_downloads) {
      await localDB.offline_downloads.put(record);
    }
    await saveDownloadToManifest(record);

    return record;
  } catch (webErr: any) {
    throw new Error('Não foi possível iniciar o download no navegador.');
  }
}

// Lock de sincronização para prevenir concorrência e race condition
let activeSyncPromise: Promise<void> | null = null;

/**
 * Sincroniza os arquivos físicos salvos no disco do Android com o manifesto e o banco IndexedDB (Dexie).
 * Garante que qualquer vídeo baixado seja contabilizado com o tamanho exato em disco e que nunca
 * sejam apagados títulos salvos caso a verificação inicial ocorra antes da montagem do sistema de arquivos.
 */
export async function syncOfflineDownloadsWithDisk(): Promise<void> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    try {
      await _internalSyncOfflineDownloadsWithDisk();
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

async function _internalSyncOfflineDownloadsWithDisk(): Promise<void> {
  // 1. Carrega o manifesto persistente do disco / localStorage
  const manifest = await readManifestFromDisk();

  if (isNativeApp()) {
    try {
      // Garante que a pasta videos existe
      try {
        await Filesystem.mkdir({ path: 'videos', directory: Directory.Data, recursive: true });
      } catch {}

      // Lê arquivos existentes no diretório videos nativo
      let filesList: any[] = [];
      try {
        const dirResult = await Filesystem.readdir({ path: 'videos', directory: Directory.Data });
        filesList = dirResult.files || [];
      } catch (readdirErr) {
        console.warn('[DownloadManager] readdir videos ignorado:', readdirErr);
      }

      const physicalFiles = new Map<string, number>(); // fileName -> size

      for (const f of filesList) {
        const name = typeof f === 'string' ? f : (f as any).name;
        if (!name || !name.startsWith('offline_') || name.endsWith('.tmp')) continue;

        try {
          const stat = await Filesystem.stat({ path: `videos/${name}`, directory: Directory.Data });
          if (stat.size && stat.size > 0) {
            physicalFiles.set(name, stat.size);
          }
        } catch {}
      }

      // 2. Atualiza o IndexedDB e o manifesto com os arquivos físicos encontrados
      for (const [fileName, size] of physicalFiles.entries()) {
        const withoutPrefix = fileName.replace(/^offline_/, '');
        const lastDot = withoutPrefix.lastIndexOf('.');
        const cleanId = lastDot !== -1 ? withoutPrefix.substring(0, lastDot) : withoutPrefix;
        const extension = lastDot !== -1 ? withoutPrefix.substring(lastDot + 1) : 'mp4';

        const manifestRecord = manifest[cleanId];
        let existingInDb: OfflineDownload | undefined;
        if (localDB?.offline_downloads) {
          try {
            existingInDb = await localDB.offline_downloads.get(cleanId);
          } catch {}
        }

        if (existingInDb) {
          // Atualiza tamanho físico real se tiver mudado
          let changed = false;
          if (existingInDb.file_size !== size) {
            existingInDb.file_size = size;
            changed = true;
          }
          // Recupera metadados enriquecidos do manifesto se o DB só tinha título genérico
          if (manifestRecord?.title && (!existingInDb.title || existingInDb.title.startsWith('Vídeo '))) {
            existingInDb.title = manifestRecord.title;
            existingInDb.series_title = manifestRecord.series_title;
            existingInDb.poster_url = manifestRecord.poster_url || existingInDb.poster_url;
            changed = true;
          }
          if (changed && localDB?.offline_downloads) {
            await localDB.offline_downloads.put(existingInDb).catch(() => {});
          }
          manifest[cleanId] = existingInDb;
        } else if (manifestRecord) {
          // Restaura do manifesto para o IndexedDB
          manifestRecord.file_size = size;
          if (localDB?.offline_downloads) {
            await localDB.offline_downloads.put(manifestRecord).catch(() => {});
          }
        } else {
          // Arquivo físico no disco sem registro anterior no manifest:
          // 1. Tenta carregar do companion JSON individual (offline_{id}.json) gravado ao lado do vídeo
          let companionRecord: OfflineDownload | undefined;
          try {
            const jsonRes = await Filesystem.readFile({
              path: `videos/offline_${cleanId}.json`,
              directory: Directory.Data,
            });
            const jsonStr = typeof jsonRes.data === 'string' ? jsonRes.data : '';
            if (jsonStr) {
              companionRecord = JSON.parse(jsonStr);
            }
          } catch {}

          if (companionRecord) {
            companionRecord.file_size = size;
            companionRecord.file_path = `videos/${fileName}`;
            if (localDB?.offline_downloads) {
              await localDB.offline_downloads.put(companionRecord).catch(() => {});
            }
            manifest[cleanId] = companionRecord;
          } else {
            // 2. Se não encontrou companion JSON, sintetiza com base no nome do arquivo físico
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

            let title = isMovie ? `Filme ${streamId}` : `Série ${streamId}`;
            let posterUrl: string | undefined;

            if (localDB?.streams) {
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
            }

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

            // Salva companion JSON no disco para futuras inicializações offline
            try {
              await Filesystem.writeFile({
                path: `videos/offline_${cleanId}.json`,
                data: JSON.stringify(newRecord, null, 2),
                directory: Directory.Data,
                encoding: 'utf8' as any,
              });
            } catch {}

            if (localDB?.offline_downloads) {
              await localDB.offline_downloads.put(newRecord).catch(() => {});
            }
            manifest[cleanId] = newRecord;
          }
        }
      }

      // 3. Remove apenas registros cujos arquivos físicos comprovadamente não existem mais
      // REGRA DE SEGURANÇA CRÍTICA: NUNCA apagar nada se physicalFiles estiver vazio (evita apagar dados se o readdir oscilar)
      if (physicalFiles.size > 0 && localDB?.offline_downloads) {
        try {
          const allDbRecords = await localDB.offline_downloads.toArray();
          for (const rec of allDbRecords) {
            const filePath = rec.file_path || '';
            if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('blob:')) {
              continue; // Ignora downloads web padrão
            }
            const fileName = filePath.includes('/') ? filePath.substring(filePath.lastIndexOf('/') + 1) : filePath;
            if (!physicalFiles.has(fileName)) {
              // Confirmação via stat direto antes de apagar
              try {
                const relPath = filePath.includes('videos/') ? filePath.substring(filePath.indexOf('videos/')) : `videos/${fileName}`;
                await Filesystem.stat({ path: relPath, directory: Directory.Data });
                // Arquivo existe no disco! Mantém o registro.
              } catch {
                // Arquivo realmente ausente no disco
                await localDB.offline_downloads.delete(rec.id).catch(() => {});
                delete manifest[rec.id];
              }
            }
          }
        } catch {}
      }

      // 4. Salva o manifesto atualizado no disco e localStorage
      await writeManifestToDisk(manifest);
    } catch (e) {
      console.warn('[DownloadManager] Erro na sincronização com disco nativo:', e);
    }
  } else {
    // Ambiente Web: sincroniza manifesto do localStorage com o IndexedDB
    try {
      const cached = getCachedManifestSync();
      if (localDB?.offline_downloads && cached.length > 0) {
        for (const item of cached) {
          const exists = await localDB.offline_downloads.get(item.id);
          if (!exists) {
            await localDB.offline_downloads.put(item).catch(() => {});
          }
        }
      }
    } catch {}
  }
}

/**
 * Retorna todos os vídeos salvos offline com fallback multinível resiliente
 */
export async function getOfflineDownloadsList(): Promise<OfflineDownload[]> {
  // 1. Tenta carregar diretamente via AndroidBridge nativo (acesso direto aos arquivos do celular)
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.getOfflineDownloadsJson) {
    try {
      const raw = (window as any).AndroidBridge.getOfflineDownloadsJson();
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (localDB?.offline_downloads) {
            for (const it of parsed) {
              await localDB.offline_downloads.put(it).catch(() => {});
            }
          }
          const manifest: Record<string, OfflineDownload> = {};
          parsed.forEach((it) => {
            if (it?.id) manifest[it.id] = it;
          });
          try {
            localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
          } catch {}
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[DownloadManager] Erro ao carregar via AndroidBridge:', e);
    }
  }

  try {
    await syncOfflineDownloadsWithDisk();
    if (localDB?.offline_downloads) {
      const fromDb = await localDB.offline_downloads.toArray();
      if (fromDb.length > 0) return fromDb;
    }
  } catch (err) {
    console.warn('[DownloadManager] Erro ao consultar IndexedDB:', err);
  }

  // Fallback 1: Manifesto do disco ou localStorage
  try {
    const manifestItems = Object.values(await readManifestFromDisk());
    if (manifestItems.length > 0) {
      if (localDB?.offline_downloads) {
        for (const it of manifestItems) {
          await localDB.offline_downloads.put(it).catch(() => {});
        }
      }
      return manifestItems;
    }
  } catch {}

  // Fallback 2: Cache síncrono imediato de localStorage
  return getCachedManifestSync();
}

/**
 * Pré-carrega e aquece títulos salvos offline logo na inicialização do aplicativo
 */
export async function warmupOfflineDownloads(): Promise<OfflineDownload[]> {
  try {
    return await getOfflineDownloadsList();
  } catch {
    return getCachedManifestSync();
  }
}

/**
 * Verifica se um item específico já foi baixado
 */
export async function checkIsDownloaded(id: string): Promise<boolean> {
  if (localDB?.offline_downloads) {
    try {
      const found = await localDB.offline_downloads.get(id);
      if (found) return true;
    } catch {}
  }

  const cached = getCachedManifestSync();
  return cached.some((item) => item.id === id);
}

/**
 * Retorna a URL de reprodução offline síncrona imediata (0ms de espera)
 */
export function getPlayableOfflineUrlSync(download: OfflineDownload): string {
  if (typeof window !== 'undefined' && (window as any).AndroidBridge?.getOfflineVideoUrl) {
    try {
      const nativeUrl = (window as any).AndroidBridge.getOfflineVideoUrl(download.file_path);
      if (nativeUrl) return nativeUrl;
    } catch {}
  }
  const fileName = download.file_path.includes('/')
    ? download.file_path.substring(download.file_path.lastIndexOf('/') + 1)
    : download.file_path;
  if (isNativeApp()) {
    return `http://163.176.207.140/_local_video_/${encodeURIComponent(fileName)}`;
  }
  return download.file_path;
}

/**
 * Busca de forma síncrona/imediata do cache local de manifesto (0ms de espera)
 */
export function findCachedOfflineDownload(
  streamType: 'movie' | 'series',
  streamId: string | number,
  seasonNum?: number | string,
  episodeNum?: number | string,
  episodeId?: string | number
): OfflineDownload | undefined {
  const cached = getCachedManifestSync();
  if (!cached || cached.length === 0) return undefined;

  const targetCleanId = buildDownloadId(streamType, streamId, seasonNum, episodeNum ?? episodeId);
  const exact = cached.find((d) => d.id === targetCleanId);
  if (exact) return exact;

  const strStreamId = String(streamId);
  if (streamType === 'movie') {
    return cached.find(
      (d) =>
        d.stream_type === 'movie' &&
        (String(d.stream_id) === strStreamId || d.id === `movie_${strStreamId}` || d.id.includes(strStreamId))
    );
  } else {
    // Para séries, só busca quando o episódio ou ID do episódio for informado
    if (episodeNum === undefined && episodeId === undefined) {
      return undefined;
    }
    const sNum = seasonNum !== undefined ? Number(String(seasonNum).replace(/\D/g, '')) : undefined;
    const eNum = episodeNum !== undefined ? Number(String(episodeNum).replace(/\D/g, '')) : undefined;
    const strEpId = episodeId !== undefined ? String(episodeId) : undefined;

    return cached.find((d) => {
      if (d.stream_type !== 'series') return false;
      const idMatches =
        String(d.stream_id) === strStreamId ||
        String(d.episode_id) === strStreamId ||
        d.id === strStreamId ||
        d.id.includes(`_${strStreamId}_`) ||
        d.id.endsWith(`_${strStreamId}`);

      if (strEpId) {
        if (String(d.episode_id) === strEpId || d.id === strEpId || d.id.includes(`_${strEpId}`)) return true;
      }
      if (sNum !== undefined && d.season_num !== undefined && Number(d.season_num) !== sNum) return false;
      if (eNum !== undefined && d.episode_num !== undefined && Number(d.episode_num) === eNum) return true;
      return false;
    });
  }
}

/**
 * Busca robusta e multinível de download salvo offline (Cache -> Dexie -> Manifesto em Disco)
 */
export async function findOfflineDownloadRecord(
  streamType: 'movie' | 'series',
  streamId: string | number,
  seasonNum?: number | string,
  episodeNum?: number | string,
  episodeId?: string | number
): Promise<OfflineDownload | undefined> {
  // 1. Tenta cache síncrono imediato de 0ms
  const cached = findCachedOfflineDownload(streamType, streamId, seasonNum, episodeNum, episodeId);
  if (cached) return cached;

  const targetCleanId = buildDownloadId(streamType, streamId, seasonNum, episodeNum ?? episodeId);

  // 2. Tenta IndexedDB Dexie
  if (localDB?.offline_downloads) {
    try {
      const exact = await localDB.offline_downloads.get(targetCleanId);
      if (exact) return exact;

      const strStreamId = String(streamId);
      const allForStream = await localDB.offline_downloads.toArray();

      if (streamType === 'movie') {
        const movieRec = allForStream.find(
          (i) =>
            i.stream_type === 'movie' &&
            (String(i.stream_id) === strStreamId || i.id === `movie_${strStreamId}` || i.id.includes(strStreamId))
        );
        if (movieRec) return movieRec;
      } else {
        if (episodeNum === undefined && episodeId === undefined) {
          return undefined;
        }
        const sNum = seasonNum !== undefined ? Number(String(seasonNum).replace(/\D/g, '')) : undefined;
        const eNum = episodeNum !== undefined ? Number(String(episodeNum).replace(/\D/g, '')) : undefined;
        const strEpId = episodeId !== undefined ? String(episodeId) : undefined;

        const seriesRec = allForStream.find((i) => {
          if (i.stream_type !== 'series') return false;
          const idMatches =
            String(i.stream_id) === strStreamId ||
            String(i.episode_id) === strStreamId ||
            i.id === strStreamId ||
            i.id.includes(`_${strStreamId}_`) ||
            i.id.endsWith(`_${strStreamId}`);

          if (strEpId) {
            if (String(i.episode_id) === strEpId || i.id === strEpId || i.id.includes(`_${strEpId}`)) return true;
          }
          if (sNum !== undefined && i.season_num !== undefined && Number(i.season_num) !== sNum) return false;
          if (eNum !== undefined && i.episode_num !== undefined && Number(i.episode_num) === eNum) return true;
          return false;
        });
        if (seriesRec) return seriesRec;
      }
    } catch (e) {}
  }

  // 3. Fallback: manifesto completo do disco nativo / AndroidBridge
  try {
    const list = await getOfflineDownloadsList();
    const exact = list.find((d) => d.id === targetCleanId);
    if (exact) return exact;

    const strStreamId = String(streamId);
    if (streamType === 'movie') {
      return list.find(
        (d) =>
          d.stream_type === 'movie' &&
          (String(d.stream_id) === strStreamId || d.id === `movie_${strStreamId}` || d.id.includes(strStreamId))
      );
    } else {
      if (episodeNum === undefined && episodeId === undefined) {
        return undefined;
      }
      const sNum = seasonNum !== undefined ? Number(String(seasonNum).replace(/\D/g, '')) : undefined;
      const eNum = episodeNum !== undefined ? Number(String(episodeNum).replace(/\D/g, '')) : undefined;
      const strEpId = episodeId !== undefined ? String(episodeId) : undefined;

      return list.find((d) => {
        if (d.stream_type !== 'series') return false;
        const idMatches =
          String(d.stream_id) === strStreamId ||
          String(d.episode_id) === strStreamId ||
          d.id === strStreamId ||
          d.id.includes(`_${strStreamId}_`) ||
          d.id.endsWith(`_${strStreamId}`);

        if (strEpId) {
          if (String(d.episode_id) === strEpId || d.id === strEpId || d.id.includes(`_${strEpId}`)) return true;
        }
        if (sNum !== undefined && d.season_num !== undefined && Number(d.season_num) !== sNum) return false;
        if (eNum !== undefined && d.episode_num !== undefined && Number(d.episode_num) === eNum) return true;
        return false;
      });
    }
  } catch {}

  return undefined;
}

/**
 * Retorna itens baixados agrupados por Título / Série (ideal para a aba Offline e Favoritos)
 */
export async function getGroupedOfflineDownloads(cachedList?: OfflineDownload[]): Promise<GroupedDownloadItem[]> {
  const all = cachedList || (await getOfflineDownloadsList());
  const map = new Map<string, GroupedDownloadItem>();

  for (const item of all) {
    const mainTitle = item.series_title || (item.stream_type === 'series' ? item.title.split(' - ')[0] : item.title);
    const groupKey =
      item.stream_type === 'series'
        ? `series_${(item.series_title || mainTitle).trim().toLowerCase()}`
        : `movie_${item.stream_id}`;

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
      // Evita duplicatas do mesmo episódio
      if (!existing.episodes.some((e) => e.id === item.id)) {
        existing.episodes.push(item);
      }
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
  const syncUrl = getPlayableOfflineUrlSync(download);
  if (syncUrl && syncUrl.includes('/_local_video_/')) {
    return syncUrl;
  }

  if (isNativeApp()) {
    try {
      if (download.file_path && (download.file_path.startsWith('/') || download.file_path.startsWith('file://'))) {
        return Capacitor.convertFileSrc(download.file_path);
      }
      const uriResult = await Filesystem.getUri({
        path: download.file_path,
        directory: Directory.Data,
      });
      if (uriResult?.uri) {
        return Capacitor.convertFileSrc(uriResult.uri);
      }
      return Capacitor.convertFileSrc(download.file_path);
    } catch {
      return syncUrl || download.file_path;
    }
  }
  return syncUrl || download.file_path;
}

/**
 * Remove um vídeo baixado da memória, do manifesto e do banco de dados
 */
export async function deleteOfflineDownload(id: string): Promise<void> {
  try {
    let filePath: string | undefined;

    if (localDB?.offline_downloads) {
      const record = await localDB.offline_downloads.get(id);
      if (record) filePath = record.file_path;
      await localDB.offline_downloads.delete(id).catch(() => {});
    }

    if (!filePath) {
      const manifest = await readManifestFromDisk();
      if (manifest[id]) filePath = manifest[id].file_path;
    }

    // Remove do manifesto persistente
    await removeDownloadFromManifest(id);

    // Se estiver no APK nativo, remove via AndroidBridge nativo
    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.deleteOfflineVideo) {
      try {
        (window as any).AndroidBridge.deleteOfflineVideo(id, filePath || null);
      } catch (e) {}
    }

    if (filePath && isNativeApp()) {
      try {
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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(PROGRESS_EVENT, {
          detail: { id, done: true, deleted: true },
        })
      );
      window.dispatchEvent(
        new CustomEvent('offline-downloads-changed', {
          detail: { id, action: 'deleted' },
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
  try {
    const list = await getOfflineDownloadsList();
    const items = list.filter(
      (i) => String(i.stream_id) === String(streamId) && i.stream_type === streamType
    );

    for (const item of items) {
      await deleteOfflineDownload(item.id);
    }
  } catch (err) {
    console.error('[DownloadManager] Erro ao excluir grupo de downloads:', err);
  }
}
