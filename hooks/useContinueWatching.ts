'use client';
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { ContinueWatchingItem, StreamType } from '@/lib/types';

const EMPTY_CONTINUE_LIST: ContinueWatchingItem[] = [];

function getStorageKey(userId?: string | null): string {
  return userId ? `miruro_con_${userId}` : 'miruro_continue_watching';
}

// Store singleton em memória compartilhado
let globalContinueCache: ContinueWatchingItem[] | null = null;
let globalContinueUserId: string | null = null;
let lastContinueFetch = 0;
let lastUiBroadcast = 0;
let continueInFlight: Promise<ContinueWatchingItem[]> | null = null;
let storageListenerAttached = false;
const listeners = new Set<() => void>();
const CACHE_TTL_MS = 60 * 1000;
const UI_BROADCAST_THROTTLE_MS = 10 * 1000;

function notifyContinueListeners() {
  for (const listener of Array.from(listeners)) {
    try {
      listener();
    } catch {}
  }
}

function getContinueSnapshot(): ContinueWatchingItem[] {
  return globalContinueCache || EMPTY_CONTINUE_LIST;
}

function getContinueServerSnapshot(): ContinueWatchingItem[] {
  return EMPTY_CONTINUE_LIST;
}

function subscribeNoop(): () => void {
  return () => {};
}

function subscribeContinue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetContinueCache() {
  globalContinueCache = null;
  globalContinueUserId = null;
  lastContinueFetch = 0;
  lastUiBroadcast = 0;
  continueInFlight = null;
  notifyContinueListeners();
}

function broadcastContinueUpdated(next: ContinueWatchingItem[], userId?: string | null, persist = true) {
  globalContinueCache = next;
  lastUiBroadcast = Date.now();
  if (userId) {
    globalContinueUserId = userId;
  }
  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(globalContinueUserId), JSON.stringify(next));
    } catch {}
  }
  notifyContinueListeners();
}

function attachCrossTabContinueListener() {
  if (storageListenerAttached || typeof window === 'undefined') return;
  storageListenerAttached = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== getStorageKey(globalContinueUserId) || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as ContinueWatchingItem[];
      if (Array.isArray(parsed)) {
        broadcastContinueUpdated(parsed, globalContinueUserId, false);
      }
    } catch {}
  });
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
        lastContinueFetch = Date.now();
        broadcastContinueUpdated(serverItems, resUserId, true);
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

const syncThrottles = new Map<string, { lastSent: number; timeoutId: ReturnType<typeof setTimeout> | null }>();

export function useContinueWatching(options: { subscribe?: boolean } = {}) {
  const { subscribe = true } = options;
  const items = useSyncExternalStore(
    subscribe ? subscribeContinue : subscribeNoop,
    subscribe ? getContinueSnapshot : getContinueServerSnapshot,
    getContinueServerSnapshot
  );
  const [loading, setLoading] = useState(() => globalContinueCache === null);

  const fetchItems = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && globalContinueCache && now - lastContinueFetch < CACHE_TTL_MS) {
      setLoading(false);
      return;
    }

    try {
      await syncContinueFromServer();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active || typeof window === 'undefined') return;
      attachCrossTabContinueListener();
      if (!globalContinueCache) {
        try {
          const cached = localStorage.getItem(getStorageKey(globalContinueUserId));
          if (cached) {
            const parsed = JSON.parse(cached) as ContinueWatchingItem[];
            if (Array.isArray(parsed)) {
              globalContinueCache = parsed;
              if (subscribe) notifyContinueListeners();
            }
          }
        } catch {}
      }
      if (globalContinueCache !== null) {
        setLoading(false);
      }
    });

    if (globalContinueCache === null || (subscribe && Date.now() - lastContinueFetch >= CACHE_TTL_MS)) {
      syncContinueFromServer().finally(() => {
        if (active) setLoading(false);
      });
    }

    return () => {
      active = false;
    };
  }, [fetchItems, subscribe]);

  const saveProgress = useCallback(async (payload: SaveProgressPayload, immediate = false) => {
    const curTime = Math.floor(payload.currentTime);
    const dur = Math.floor(payload.duration);
    if (dur <= 0 || curTime < 5) return;

    const progressPercent = Math.min(100, Math.round((curTime / dur) * 1000) / 10);
    const effectiveStreamId =
      payload.streamType === 'series' && payload.seriesId
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

    const currentList = globalContinueCache || [];
    const hadItemBefore = currentList.some((i) => i.id === uniqueId);
    const filtered = currentList.filter(
      (i) =>
        i.id !== uniqueId &&
        !(
          i.stream_type === payload.streamType &&
          (String(i.stream_id) === effectiveStreamId || String(i.series_id) === effectiveStreamId)
        ) &&
        !String(i.id).startsWith(`${payload.streamType}_${effectiveStreamId}_`)
    );
    const next = [optimisticItem, ...filtered].slice(0, 24);

    // Atualiza o cache em memória sempre, mas só persiste no localStorage e notifica a UI
    // no máximo a cada 10s (ou imediatamente ao pausar/sair/novo título), evitando re-render 4x/s
    globalContinueCache = next;
    const now = Date.now();
    if (immediate || !hadItemBefore || now - lastUiBroadcast >= UI_BROADCAST_THROTTLE_MS) {
      broadcastContinueUpdated(next, globalContinueUserId, true);
    }

    // Sincronização inteligente com servidor (throttle de 15s)
    const itemKey = `${payload.streamType}_${effectiveStreamId}`;
    const throttleInfo = syncThrottles.get(itemKey) || { lastSent: 0, timeoutId: null };
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
  }, []);

  const removeItem = useCallback(async (id: string) => {
    const currentList = globalContinueCache || [];
    const next = currentList.filter((i) => i.id !== id);
    broadcastContinueUpdated(next, globalContinueUserId, true);

    try {
      await fetch(`/api/continue-watching?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('[useContinueWatching] Falha ao remover item:', e);
    }
  }, []);

  return {
    items,
    loading,
    saveProgress,
    removeItem,
    refresh: fetchItems,
  };
}
