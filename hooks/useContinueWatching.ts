'use client';
import { useState, useEffect, useCallback } from 'react';
import { ContinueWatchingItem, StreamType } from '@/lib/types';

const EVENT_NAME = 'miruro_continue_watching_updated';

function getStorageKey(userId?: string | null): string {
  return userId ? `miruro_con_${userId}` : 'miruro_continue_watching';
}

// Cache em memória a nível de módulo
let globalContinueCache: ContinueWatchingItem[] | null = null;
let globalContinueUserId: string | null = null;
let lastContinueFetch = 0;
let continueInFlight: Promise<ContinueWatchingItem[]> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos de cooldown entre chamadas à API

export function resetContinueCache() {
  globalContinueCache = null;
  globalContinueUserId = null;
  lastContinueFetch = 0;
  continueInFlight = null;
}

function broadcastContinueUpdated(next: ContinueWatchingItem[], userId?: string | null) {
  globalContinueCache = next;
  lastContinueFetch = Date.now();
  if (userId) {
    globalContinueUserId = userId;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(globalContinueUserId), JSON.stringify(next));
    } catch (e) {}
    setTimeout(() => {
      window.dispatchEvent(new Event(EVENT_NAME));
    }, 0);
  }
}

async function syncContinueFromServer(): Promise<ContinueWatchingItem[]> {
  if (continueInFlight) {
    return continueInFlight;
  }

  continueInFlight = (async () => {
    try {
      const res = await fetch('/api/continue-watching');
      if (res.ok) {
        const data = await res.json();
        const serverItems: ContinueWatchingItem[] = data.items || [];
        const resUserId: string | null = data.userId || null;

        if (resUserId && globalContinueUserId && resUserId !== globalContinueUserId) {
          globalContinueCache = null;
        }
        globalContinueUserId = resUserId;
        broadcastContinueUpdated(serverItems, resUserId);
        return serverItems;
      }
    } catch (e) {
      console.warn('[useContinueWatching] Erro ao carregar itens:', e);
    } finally {
      continueInFlight = null;
    }
    return globalContinueCache || [];
  })();

  return continueInFlight;
}

export interface SaveProgressPayload {
  streamId: string;
  streamType: StreamType;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  categoryName?: string;
  seriesId?: string;
  seriesTitle?: string;
  episodeId?: string;
  episodeNum?: number | string;
  seasonNum?: number | string;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
}

const syncThrottles = new Map<string, { lastSent: number; timeoutId: any }>();

export function useContinueWatching() {
  const [items, setItems] = useState<ContinueWatchingItem[]>(() => {
    return globalContinueCache || [];
  });
  const [loading, setLoading] = useState(!globalContinueCache);

  const fetchItems = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && globalContinueCache && now - lastContinueFetch < CACHE_TTL_MS) {
      setItems(globalContinueCache);
      setLoading(false);
      return;
    }

    try {
      const serverItems = await syncContinueFromServer();
      setItems(serverItems);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!globalContinueCache && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(getStorageKey(globalContinueUserId));
        if (cached) {
          const parsed = JSON.parse(cached);
          globalContinueCache = parsed;
          setItems(parsed);
        }
      } catch (e) {}
    }

    fetchItems();

    const handleSync = () => {
      try {
        const cached = localStorage.getItem(getStorageKey(globalContinueUserId));
        if (cached) {
          const parsed: ContinueWatchingItem[] = JSON.parse(cached);
          globalContinueCache = parsed;
          setItems(parsed);
        } else if (globalContinueCache) {
          setItems(globalContinueCache);
        }
      } catch (e) {}
    };

    window.addEventListener(EVENT_NAME, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(EVENT_NAME, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [fetchItems]);

  const saveProgress = useCallback(async (payload: SaveProgressPayload, immediate = false) => {
    const curTime = Math.floor(payload.currentTime);
    const dur = Math.floor(payload.duration);
    if (dur <= 0 || curTime < 5) return;

    const progressPercent = Math.min(100, Math.round((curTime / dur) * 1000) / 10);
    const effectiveStreamId = payload.streamType === 'series' && payload.seriesId
      ? String(payload.seriesId)
      : String(payload.streamId);
    const uniqueId = `${payload.streamType}_${effectiveStreamId}`;

    const optimisticItem: ContinueWatchingItem = {
      id: uniqueId,
      user_id: globalContinueUserId || undefined,
      stream_id: effectiveStreamId,
      stream_type: payload.streamType,
      title: payload.streamType === 'series' && payload.seriesTitle ? payload.seriesTitle : payload.title,
      poster_url: payload.posterUrl,
      backdrop_url: payload.backdropUrl,
      category_name: payload.categoryName,

      series_id: payload.seriesId ? String(payload.seriesId) : undefined,
      series_title: payload.seriesTitle,
      episode_id: payload.episodeId ? String(payload.episodeId) : undefined,
      episode_num: payload.episodeNum,
      season_num: payload.seasonNum,
      episode_title: payload.episodeTitle,

      current_time: curTime,
      duration: dur,
      progress_percentage: progressPercent,
      last_watched_at: new Date().toISOString(),
    };

    const currentList = globalContinueCache || items;
    const filtered = currentList.filter(
      (i) =>
        i.id !== uniqueId &&
        !(i.stream_type === payload.streamType && (String(i.stream_id) === effectiveStreamId || String(i.series_id) === effectiveStreamId)) &&
        !String(i.id).startsWith(`${payload.streamType}_${effectiveStreamId}_`)
    );
    const next = [optimisticItem, ...filtered].slice(0, 24);

    setItems(next);
    broadcastContinueUpdated(next, globalContinueUserId);

    // Sincronização inteligente com throttling ajustado para 15 segundos
    const itemKey = `${payload.streamType}_${effectiveStreamId}`;
    const throttleInfo = syncThrottles.get(itemKey) || { lastSent: 0, timeoutId: null };
    const now = Date.now();
    const MIN_INTERVAL_MS = 15000;

    const sendServerSync = async () => {
      try {
        await fetch('/api/continue-watching', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        throttleInfo.lastSent = Date.now();
      } catch (e) {
        console.warn('[useContinueWatching] Erro ao sincronizar com servidor:', e);
      }
    };

    if (throttleInfo.timeoutId) {
      clearTimeout(throttleInfo.timeoutId);
      throttleInfo.timeoutId = null;
    }

    // Se for salvamento imediato (evento de pause, ended, unmount ou saída de página)
    if (immediate || now - throttleInfo.lastSent >= MIN_INTERVAL_MS) {
      throttleInfo.lastSent = now;
      syncThrottles.set(itemKey, throttleInfo);
      sendServerSync();
    } else {
      const waitTime = MIN_INTERVAL_MS - (now - throttleInfo.lastSent);
      throttleInfo.timeoutId = setTimeout(() => {
        throttleInfo.timeoutId = null;
        sendServerSync();
      }, waitTime);
      syncThrottles.set(itemKey, throttleInfo);
    }
  }, [items]);

  const removeItem = useCallback(async (id: string) => {
    const currentList = globalContinueCache || items;
    const next = currentList.filter((i) => i.id !== id);

    setItems(next);
    broadcastContinueUpdated(next, globalContinueUserId);

    try {
      await fetch(`/api/continue-watching?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('[useContinueWatching] Falha ao remover item:', e);
    }
  }, [items]);

  return {
    items,
    loading,
    saveProgress,
    removeItem,
    refresh: fetchItems,
  };
}
