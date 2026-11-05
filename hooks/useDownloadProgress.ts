import { useState, useEffect, useCallback } from 'react';
import {
  PROGRESS_EVENT,
  DownloadProgress,
  getAllActiveDownloads,
  activeDownloadTitles,
} from '@/lib/download-manager';

export interface ActiveDownloadItem {
  id: string;
  title: string;
  progress: DownloadProgress;
}

export function useDownloadProgress() {
  const [downloads, setDownloads] = useState<Record<string, { title: string; progress: DownloadProgress }>>(() => {
    const initialMap = getAllActiveDownloads();
    const result: Record<string, { title: string; progress: DownloadProgress }> = {};
    for (const [id, progress] of Object.entries(initialMap)) {
      result[id] = {
        title: activeDownloadTitles[id] || 'Vídeo',
        progress,
      };
    }
    return result;
  });

  useEffect(() => {
    const handleProgressEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        id: string;
        title: string;
        progress?: DownloadProgress;
        done?: boolean;
        success?: boolean;
      }>;

      const { id, title, progress, done } = customEvent.detail || {};
      if (!id) return;

      setDownloads((prev) => {
        if (done) {
          const next = { ...prev };
          delete next[id];
          return next;
        }

        if (progress) {
          return {
            ...prev,
            [id]: {
              title: title || prev[id]?.title || 'Vídeo',
              progress,
            },
          };
        }

        return prev;
      });
    };

    window.addEventListener(PROGRESS_EVENT, handleProgressEvent);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, handleProgressEvent);
    };
  }, []);

  const getProgress = useCallback(
    (id: string): DownloadProgress | undefined => {
      return downloads[id]?.progress;
    },
    [downloads]
  );

  const isDownloading = useCallback(
    (id: string): boolean => {
      return !!downloads[id];
    },
    [downloads]
  );

  const activeList: ActiveDownloadItem[] = Object.entries(downloads).map(([id, item]) => ({
    id,
    title: item.title,
    progress: item.progress,
  }));

  return {
    downloads,
    activeList,
    activeCount: activeList.length,
    getProgress,
    isDownloading,
  };
}
