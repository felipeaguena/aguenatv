'use client';
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { WatchedItem, StreamType } from '@/lib/types';
import { createSyncedListStore, normalizeStreamType } from '@/lib/synced-list-store';

const EMPTY_WATCHED: WatchedItem[] = [];

const watchedStore = createSyncedListStore<WatchedItem>({
  storagePrefix: 'miruro_wat_',
  fallbackStorageKey: 'miruro_local_watched',
  apiEndpoint: '/api/watched',
  extractItems: (data) => (Array.isArray(data.watched) ? (data.watched as WatchedItem[]) : []),
  buildKey: (w) => (w.is_completed ? `${normalizeStreamType(w.stream_type)}_${String(w.stream_id)}` : null),
});

export function resetWatchedCache() {
  watchedStore.reset();
}

export function useWatched() {
  const watchedList = useSyncExternalStore(
    watchedStore.subscribe,
    watchedStore.getItems,
    () => EMPTY_WATCHED
  );
  const [loading, setLoading] = useState(() => !watchedStore.isLoaded());

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      watchedStore.hydrateFromStorage();
      if (watchedStore.isLoaded()) {
        setLoading(false);
      }
    });

    watchedStore.syncFromServer().finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const fetchWatched = useCallback(async (force = false) => {
    try {
      await watchedStore.syncFromServer(force);
    } finally {
      setLoading(false);
    }
  }, []);

  const markWatched = useCallback(
    async (
      streamId: string | number,
      streamType: string,
      title: string,
      isCompleted = true,
      meta?: {
        posterUrl?: string;
        categoryName?: string;
        rating?: string | number;
      }
    ) => {
      const normType = normalizeStreamType(streamType) as StreamType;
      const targetId = String(streamId);
      const userId = watchedStore.getUserId();

      const tempItem: WatchedItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: userId || 'me',
        stream_id: targetId,
        stream_type: normType,
        title,
        poster_url: meta?.posterUrl,
        category_name: meta?.categoryName,
        rating: meta?.rating ? String(meta.rating) : undefined,
        progress_seconds: 0,
        is_completed: isCompleted,
        watched_at: new Date().toISOString(),
      };

      const filtered = watchedStore
        .getItems()
        .filter((w) => !(String(w.stream_id) === targetId && normalizeStreamType(w.stream_type) === normType));
      const next = [tempItem, ...filtered];
      watchedStore.updateItems(next, userId);

      try {
        const res = await fetch('/api/watched', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streamId: targetId,
            streamType: normType,
            title,
            isCompleted,
            posterUrl: meta?.posterUrl,
            categoryName: meta?.categoryName,
            rating: meta?.rating,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.watchedItem) {
            const updated = watchedStore
              .getItems()
              .map((w) =>
                String(w.stream_id) === targetId && normalizeStreamType(w.stream_type) === normType
                  ? data.watchedItem
                  : w
              );
            watchedStore.updateItems(updated, data.userId || userId);
          }
        }
      } catch (e) {
        console.warn('[useWatched] Falha ao salvar status de assistido:', e);
      }
    },
    []
  );

  const removeWatched = useCallback(async (streamId: string | number, streamType: string) => {
    const normType = normalizeStreamType(streamType);
    const targetId = String(streamId);
    const userId = watchedStore.getUserId();

    const next = watchedStore
      .getItems()
      .filter((w) => !(String(w.stream_id) === targetId && normalizeStreamType(w.stream_type) === normType));
    watchedStore.updateItems(next, userId);

    try {
      await fetch(`/api/watched?streamId=${targetId}&streamType=${normType}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('[useWatched] Falha ao remover item assistido:', e);
    }
  }, []);

  const isWatched = useCallback((streamId?: string | number, streamType?: string) => {
    if (!streamId || !streamType) return false;
    return watchedStore.getKeySet().has(`${normalizeStreamType(streamType)}_${String(streamId)}`);
  }, []);

  return {
    watchedList,
    loading,
    markWatched,
    removeWatched,
    isWatched,
    refreshWatched: fetchWatched,
  };
}
