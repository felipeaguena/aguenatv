'use client';
import { useState, useEffect, useCallback } from 'react';
import { WatchedItem, StreamType } from '@/lib/types';

const EVENT_NAME = 'miruro_watched_updated';

function getStorageKey(userId?: string | null): string {
  return userId ? `miruro_wat_${userId}` : 'miruro_local_watched';
}

function normalizeType(t: string): string {
  if (t === 'movies') return 'movie';
  return t;
}

// Cache em memória compartilhado
let globalWatchedCache: WatchedItem[] | null = null;
let globalWatchedUserId: string | null = null;
let lastWatchedFetch = 0;
let watchedInFlight: Promise<WatchedItem[]> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos de cooldown entre chamadas à API

export function resetWatchedCache() {
  globalWatchedCache = null;
  globalWatchedUserId = null;
  lastWatchedFetch = 0;
  watchedInFlight = null;
}

function broadcastWatchedUpdated(next: WatchedItem[], userId?: string | null) {
  globalWatchedCache = next;
  lastWatchedFetch = Date.now();
  if (userId) {
    globalWatchedUserId = userId;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(globalWatchedUserId), JSON.stringify(next));
    } catch (e) {}
    setTimeout(() => {
      window.dispatchEvent(new Event(EVENT_NAME));
    }, 0);
  }
}

async function syncWatchedFromServer(): Promise<WatchedItem[]> {
  if (watchedInFlight) {
    return watchedInFlight;
  }

  watchedInFlight = (async () => {
    try {
      const res = await fetch('/api/watched');
      if (res.ok) {
        const data = await res.json();
        const serverWatched: WatchedItem[] = data.watched || [];
        const resUserId: string | null = data.userId || null;

        if (resUserId && globalWatchedUserId && resUserId !== globalWatchedUserId) {
          globalWatchedCache = null;
        }
        globalWatchedUserId = resUserId;
        broadcastWatchedUpdated(serverWatched, resUserId);
        return serverWatched;
      }
    } catch (e) {
      console.warn('[useWatched] Erro ao carregar histórico de assistidos:', e);
    } finally {
      watchedInFlight = null;
    }
    return globalWatchedCache || [];
  })();

  return watchedInFlight;
}

export function useWatched() {
  const [watchedList, setWatchedList] = useState<WatchedItem[]>(() => {
    return globalWatchedCache || [];
  });
  const [loading, setLoading] = useState(!globalWatchedCache);

  const fetchWatched = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && globalWatchedCache && now - lastWatchedFetch < CACHE_TTL_MS) {
      setWatchedList(globalWatchedCache);
      setLoading(false);
      return;
    }

    try {
      const serverWatched = await syncWatchedFromServer();
      setWatchedList(serverWatched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!globalWatchedCache && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(getStorageKey(globalWatchedUserId));
        if (cached) {
          const parsed = JSON.parse(cached);
          globalWatchedCache = parsed;
          setWatchedList(parsed);
        }
      } catch (e) {}
    }

    fetchWatched();

    const handleSync = () => {
      try {
        const cached = localStorage.getItem(getStorageKey(globalWatchedUserId));
        if (cached) {
          const parsed: WatchedItem[] = JSON.parse(cached);
          globalWatchedCache = parsed;
          setWatchedList(parsed);
        } else if (globalWatchedCache) {
          setWatchedList(globalWatchedCache);
        }
      } catch (e) {}
    };

    window.addEventListener(EVENT_NAME, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(EVENT_NAME, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [fetchWatched]);

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
      const normType = normalizeType(streamType) as StreamType;
      const targetId = String(streamId);

      const tempItem: WatchedItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: globalWatchedUserId || 'me',
        stream_id: targetId,
        stream_type: normType,
        title,
        poster_url: meta?.posterUrl,
        category_name: meta?.categoryName,
        rating: meta?.rating ? String(meta?.rating) : undefined,
        progress_seconds: 0,
        is_completed: isCompleted,
        watched_at: new Date().toISOString(),
      };

      const currentList = globalWatchedCache || watchedList;
      const filtered = currentList.filter(
        (w) => !(String(w.stream_id) === targetId && normalizeType(w.stream_type) === normType)
      );
      const next = [tempItem, ...filtered];

      // Otimista imediato
      setWatchedList(next);
      broadcastWatchedUpdated(next, globalWatchedUserId);

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
            const listNow = globalWatchedCache || next;
            const updated = listNow.map((w) =>
              String(w.stream_id) === targetId && normalizeType(w.stream_type) === normType
                ? data.watchedItem
                : w
            );
            setWatchedList(updated);
            broadcastWatchedUpdated(updated, data.userId || globalWatchedUserId);
          }
        }
      } catch (e) {
        console.warn('[useWatched] Falha ao salvar status de assistido:', e);
      }
    },
    [watchedList]
  );

  const removeWatched = useCallback(
    async (streamId: string | number, streamType: string) => {
      const normType = normalizeType(streamType);
      const targetId = String(streamId);

      const currentList = globalWatchedCache || watchedList;
      const next = currentList.filter(
        (w) => !(String(w.stream_id) === targetId && normalizeType(w.stream_type) === normType)
      );

      setWatchedList(next);
      broadcastWatchedUpdated(next, globalWatchedUserId);

      try {
        await fetch(`/api/watched?streamId=${targetId}&streamType=${normType}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('[useWatched] Falha ao remover item assistido:', e);
      }
    },
    [watchedList]
  );

  const isWatched = useCallback(
    (streamId?: string | number, streamType?: string) => {
      if (!streamId || !streamType) return false;
      const normType = normalizeType(streamType);
      const targetId = String(streamId);
      return watchedList.some(
        (w) =>
          String(w.stream_id) === targetId &&
          normalizeType(w.stream_type) === normType &&
          w.is_completed
      );
    },
    [watchedList]
  );

  return {
    watchedList,
    loading,
    markWatched,
    removeWatched,
    isWatched,
    refreshWatched: fetchWatched,
  };
}
