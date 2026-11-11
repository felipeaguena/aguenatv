'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  OfflineDownload,
  DownloadProgress,
  getCachedManifestSync,
  getOfflineDownloadsList,
  deleteOfflineDownload,
  getPlayableOfflineUrlSync,
  buildDownloadId,
  findCachedOfflineDownload,
  PROGRESS_EVENT,
  getAllActiveDownloads,
} from '@/lib/download-manager';

// Cache compartilhado em memória em nível de módulo para 0ms e sincronia perfeita entre páginas
let globalDownloadedMap: Record<string, OfflineDownload> = {};
let globalDownloadingMap: Record<string, DownloadProgress> = {};
const listeners = new Set<() => void>();

function notifyAll() {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch (e) {
      console.warn('[useOfflineDownloads] Erro em listener:', e);
    }
  }
}

// Inicialização imediata com dados do disco/bridge/localStorage
if (typeof window !== 'undefined') {
  try {
    const initialList = getCachedManifestSync();
    for (const item of initialList) {
      if (item && item.id) {
        globalDownloadedMap[item.id] = item;
      }
    }
    const active = getAllActiveDownloads();
    for (const [id, prog] of Object.entries(active)) {
      globalDownloadingMap[id] = prog;
    }
  } catch {}
}

export function useOfflineDownloads() {
  const [, setTick] = useState(0);

  const forceUpdate = useCallback(() => {
    setTick((t) => (t + 1) % 1000000);
  }, []);

  useEffect(() => {
    listeners.add(forceUpdate);
    return () => {
      listeners.delete(forceUpdate);
    };
  }, [forceUpdate]);

  const refreshDownloads = useCallback(async () => {
    try {
      const list = await getOfflineDownloadsList();
      const nextMap: Record<string, OfflineDownload> = {};
      for (const item of list) {
        if (item && item.id) {
          nextMap[item.id] = item;
        }
      }
      globalDownloadedMap = nextMap;
      notifyAll();
    } catch (e) {
      console.warn('[useOfflineDownloads] Erro ao sincronizar downloads:', e);
    }
  }, []);

  useEffect(() => {
    // Escuta eventos de progresso e finalização de downloads
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail?.id) return;

      const { id, progress, done, deleted, success } = detail;

      if (done) {
        const nextDownloading = { ...globalDownloadingMap };
        delete nextDownloading[id];
        globalDownloadingMap = nextDownloading;

        if (deleted) {
          const nextDownloaded = { ...globalDownloadedMap };
          delete nextDownloaded[id];
          for (const [k, v] of Object.entries(nextDownloaded)) {
            if (k === id || v.id === id) {
              delete nextDownloaded[k];
            }
          }
          globalDownloadedMap = nextDownloaded;
          notifyAll();
        } else if (success) {
          // Re-sincroniza lista de downloads
          const cached = getCachedManifestSync();
          const nextMap: Record<string, OfflineDownload> = {};
          for (const item of cached) {
            if (item && item.id) nextMap[item.id] = item;
          }
          globalDownloadedMap = nextMap;
          notifyAll();
          refreshDownloads();
        } else {
          notifyAll();
        }
      } else if (progress) {
        globalDownloadingMap = {
          ...globalDownloadingMap,
          [id]: progress,
        };
        notifyAll();
      }
    };

    const handleDownloadsChanged = () => {
      refreshDownloads();
    };

    window.addEventListener(PROGRESS_EVENT, handleProgress);
    window.addEventListener('offline-downloads-changed', handleDownloadsChanged);

    // Na primeira montagem, revalida em segundo plano sem bloquear
    refreshDownloads();

    return () => {
      window.removeEventListener(PROGRESS_EVENT, handleProgress);
      window.removeEventListener('offline-downloads-changed', handleDownloadsChanged);
    };
  }, [refreshDownloads]);

  const isDownloaded = useCallback(
    (
      streamType: 'movie' | 'series',
      streamId: string | number,
      seasonNum?: number | string,
      episodeNumOrId?: number | string
    ): boolean => {
      if (typeof window === 'undefined') return false;
      const strStreamId = String(streamId);

      // Séries sem episódio especificado: não assume episódio aleatório
      if (streamType === 'series' && episodeNumOrId === undefined) {
        return false;
      }

      const cached = findCachedOfflineDownload(streamType, streamId, seasonNum, episodeNumOrId, episodeNumOrId);
      if (cached) return true;

      const cleanId = buildDownloadId(streamType, streamId, seasonNum, episodeNumOrId);
      if (globalDownloadedMap[cleanId]) return true;

      const strEp = episodeNumOrId !== undefined ? String(episodeNumOrId) : undefined;
      const numEp = episodeNumOrId !== undefined ? Number(String(episodeNumOrId).replace(/\D/g, '')) : undefined;
      const sNum = seasonNum !== undefined ? Number(String(seasonNum).replace(/\D/g, '')) : undefined;

      return Object.values(globalDownloadedMap).some((d) => {
        if (d.stream_type !== streamType) return false;
        if (streamType === 'movie') {
          return String(d.stream_id) === strStreamId || d.id === `movie_${strStreamId}` || d.id.includes(strStreamId);
        }
        const matchesStream =
          String(d.stream_id) === strStreamId ||
          String(d.episode_id) === strStreamId ||
          d.id.includes(`_${strStreamId}_`) ||
          d.id === strStreamId;

        if (strEp && (String(d.episode_id) === strEp || d.id === strEp || d.id.includes(`_${strEp}`))) {
          return true;
        }
        if (sNum !== undefined && d.season_num !== undefined && Number(d.season_num) !== sNum) return false;
        if (numEp !== undefined && d.episode_num !== undefined && Number(d.episode_num) === numEp) return true;
        return false;
      });
    },
    []
  );

  const getDownload = useCallback(
    (
      streamType: 'movie' | 'series',
      streamId: string | number,
      seasonNum?: number | string,
      episodeNumOrId?: number | string
    ): OfflineDownload | undefined => {
      if (typeof window === 'undefined') return undefined;
      const strStreamId = String(streamId);

      // Séries sem episódio especificado: não assume episódio aleatório para reprodução
      if (streamType === 'series' && episodeNumOrId === undefined) {
        return undefined;
      }

      const cached = findCachedOfflineDownload(streamType, streamId, seasonNum, episodeNumOrId, episodeNumOrId);
      if (cached) return cached;

      const cleanId = buildDownloadId(streamType, streamId, seasonNum, episodeNumOrId);
      if (globalDownloadedMap[cleanId]) return globalDownloadedMap[cleanId];

      const strEp = episodeNumOrId !== undefined ? String(episodeNumOrId) : undefined;
      const numEp = episodeNumOrId !== undefined ? Number(String(episodeNumOrId).replace(/\D/g, '')) : undefined;
      const sNum = seasonNum !== undefined ? Number(String(seasonNum).replace(/\D/g, '')) : undefined;

      return Object.values(globalDownloadedMap).find((d) => {
        if (d.stream_type !== streamType) return false;
        if (streamType === 'movie') {
          return String(d.stream_id) === strStreamId || d.id === `movie_${strStreamId}` || d.id.includes(strStreamId);
        }
        const matchesStream =
          String(d.stream_id) === strStreamId ||
          String(d.episode_id) === strStreamId ||
          d.id.includes(`_${strStreamId}_`) ||
          d.id === strStreamId;

        if (strEp && (String(d.episode_id) === strEp || d.id === strEp || d.id.includes(`_${strEp}`))) {
          return true;
        }
        if (sNum !== undefined && d.season_num !== undefined && Number(d.season_num) !== sNum) return false;
        if (numEp !== undefined && d.episode_num !== undefined && Number(d.episode_num) === numEp) return true;
        return false;
      });
    },
    []
  );

  const hasAnyEpisodeDownloaded = useCallback((seriesId: string | number): boolean => {
    const strId = String(seriesId);
    return Object.values(globalDownloadedMap).some(
      (d) => d.stream_type === 'series' && (String(d.stream_id) === strId || d.id.includes(`_${strId}_`))
    );
  }, []);

  const getPlayableUrl = useCallback(
    (
      streamType: 'movie' | 'series',
      streamId: string | number,
      seasonNum?: number | string,
      episodeNumOrId?: number | string
    ): string | null => {
      const rec = getDownload(streamType, streamId, seasonNum, episodeNumOrId);
      if (!rec) return null;
      return getPlayableOfflineUrlSync(rec);
    },
    [getDownload]
  );

  const getProgress = useCallback((downloadId: string): DownloadProgress | undefined => {
    return globalDownloadingMap[downloadId];
  }, []);

  const isDownloading = useCallback((downloadId: string): boolean => {
    return Boolean(globalDownloadingMap[downloadId]);
  }, []);

  const deleteDownload = useCallback(async (id: string): Promise<void> => {
    // 1. Remove de forma síncrona e instantânea (0ms) do cache em memória para resposta reativa imediata na UI
    const nextDownloaded = { ...globalDownloadedMap };
    delete nextDownloaded[id];
    for (const [k, v] of Object.entries(nextDownloaded)) {
      if (k === id || v.id === id) {
        delete nextDownloaded[k];
      }
    }
    globalDownloadedMap = nextDownloaded;

    const nextDownloading = { ...globalDownloadingMap };
    delete nextDownloading[id];
    globalDownloadingMap = nextDownloading;

    notifyAll();

    // 2. Realiza a deleção assíncrona no disco/Dexie/Android
    await deleteOfflineDownload(id);
  }, []);

  const deleteOfflineItem = useCallback(
    async (
      streamType: 'movie' | 'series',
      streamId: string | number,
      seasonNum?: number | string,
      episodeNumOrId?: number | string
    ): Promise<void> => {
      const rec = getDownload(streamType, streamId, seasonNum, episodeNumOrId);
      const cleanId = rec ? rec.id : buildDownloadId(streamType, streamId, seasonNum, episodeNumOrId);
      await deleteDownload(cleanId);
    },
    [getDownload, deleteDownload]
  );

  return {
    downloadedMap: globalDownloadedMap,
    downloadingMap: globalDownloadingMap,
    isDownloaded,
    getDownload,
    hasAnyEpisodeDownloaded,
    getPlayableUrl,
    getProgress,
    isDownloading,
    deleteDownload,
    deleteOfflineItem,
    refreshDownloads,
  };
}
