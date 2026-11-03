'use client';
import { useState, useEffect, useCallback } from 'react';
import { FavoriteItem, StreamType } from '@/lib/types';

const EVENT_NAME = 'miruro_favorites_updated';

function getStorageKey(userId?: string | null): string {
  return userId ? `miruro_fav_${userId}` : 'miruro_local_favorites';
}

function normalizeType(t: string): string {
  if (t === 'movies') return 'movie';
  return t;
}

// Cache em memória compartilhado
let globalFavoritesCache: FavoriteItem[] | null = null;
let globalFavoritesUserId: string | null = null;
let lastFavoritesFetch = 0;
let favoritesInFlight: Promise<FavoriteItem[]> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos de cooldown entre chamadas à API

export function resetFavoritesCache() {
  globalFavoritesCache = null;
  globalFavoritesUserId = null;
  lastFavoritesFetch = 0;
  favoritesInFlight = null;
}

function broadcastFavoritesUpdated(next: FavoriteItem[], userId?: string | null) {
  globalFavoritesCache = next;
  lastFavoritesFetch = Date.now();
  if (userId) {
    globalFavoritesUserId = userId;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(globalFavoritesUserId), JSON.stringify(next));
    } catch (e) {}
    setTimeout(() => {
      window.dispatchEvent(new Event(EVENT_NAME));
    }, 0);
  }
}

async function syncFavoritesFromServer(): Promise<FavoriteItem[]> {
  if (favoritesInFlight) {
    return favoritesInFlight;
  }

  favoritesInFlight = (async () => {
    try {
      const res = await fetch('/api/favorites');
      if (res.ok) {
        const data = await res.json();
        const serverFavs: FavoriteItem[] = data.favorites || [];
        const resUserId: string | null = data.userId || null;

        // Se o usuário logado mudou, invalida o cache antigo
        if (resUserId && globalFavoritesUserId && resUserId !== globalFavoritesUserId) {
          globalFavoritesCache = null;
        }
        globalFavoritesUserId = resUserId;
        broadcastFavoritesUpdated(serverFavs, resUserId);
        return serverFavs;
      }
    } catch (e) {
      console.warn('[useFavorites] Erro ao carregar favoritos da API:', e);
    } finally {
      favoritesInFlight = null;
    }
    return globalFavoritesCache || [];
  })();

  return favoritesInFlight;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    return globalFavoritesCache || [];
  });
  const [loading, setLoading] = useState(!globalFavoritesCache);

  const fetchFavorites = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && globalFavoritesCache && now - lastFavoritesFetch < CACHE_TTL_MS) {
      setFavorites(globalFavoritesCache);
      setLoading(false);
      return;
    }

    try {
      const serverFavs = await syncFavoritesFromServer();
      setFavorites(serverFavs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!globalFavoritesCache && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(getStorageKey(globalFavoritesUserId));
        if (cached) {
          const parsed = JSON.parse(cached);
          globalFavoritesCache = parsed;
          setFavorites(parsed);
        }
      } catch (e) {}
    }

    fetchFavorites();

    const handleSync = () => {
      try {
        const cached = localStorage.getItem(getStorageKey(globalFavoritesUserId));
        if (cached) {
          const parsed: FavoriteItem[] = JSON.parse(cached);
          globalFavoritesCache = parsed;
          setFavorites(parsed);
        } else if (globalFavoritesCache) {
          setFavorites(globalFavoritesCache);
        }
      } catch (e) {}
    };

    window.addEventListener(EVENT_NAME, handleSync);
    window.addEventListener('storage', handleSync);
    return () => {
      window.removeEventListener(EVENT_NAME, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [fetchFavorites]);

  const addFavorite = useCallback(
    async (item: {
      streamId: string | number;
      streamType: StreamType | string;
      title: string;
      posterUrl?: string;
      categoryName?: string;
      rating?: string | number;
    }) => {
      const normType = normalizeType(item.streamType) as StreamType;
      const targetId = String(item.streamId);

      const tempItem: FavoriteItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: globalFavoritesUserId || 'me',
        stream_id: targetId,
        stream_type: normType,
        title: item.title,
        poster_url: item.posterUrl,
        category_name: item.categoryName,
        rating: item.rating ? String(item.rating) : undefined,
        created_at: new Date().toISOString(),
      };

      const currentList = globalFavoritesCache || favorites;
      const filtered = currentList.filter(
        (f) => !(String(f.stream_id) === targetId && normalizeType(f.stream_type) === normType)
      );
      const next = [tempItem, ...filtered];

      // 1. Otimista imediato
      setFavorites(next);
      broadcastFavoritesUpdated(next, globalFavoritesUserId);

      // 2. Persistência na API
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...item,
            streamId: targetId,
            streamType: normType,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.favorite) {
            const listNow = globalFavoritesCache || next;
            const updated = listNow.map((f) =>
              String(f.stream_id) === targetId && normalizeType(f.stream_type) === normType
                ? data.favorite
                : f
            );
            setFavorites(updated);
            broadcastFavoritesUpdated(updated, data.userId || globalFavoritesUserId);
          }
        }
      } catch (err) {
        console.warn('[useFavorites] Erro ao sincronizar adição com a API:', err);
      }
    },
    [favorites]
  );

  const removeFavorite = useCallback(
    async (streamId: string | number, streamType: string) => {
      const normType = normalizeType(streamType);
      const targetId = String(streamId);

      const currentList = globalFavoritesCache || favorites;
      const next = currentList.filter(
        (f) => !(String(f.stream_id) === targetId && normalizeType(f.stream_type) === normType)
      );

      setFavorites(next);
      broadcastFavoritesUpdated(next, globalFavoritesUserId);

      try {
        await fetch(`/api/favorites?streamId=${targetId}&streamType=${normType}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('[useFavorites] Erro ao sincronizar remoção com a API:', e);
      }
    },
    [favorites]
  );

  const isFavorite = useCallback(
    (streamId?: string | number, streamType?: string) => {
      if (!streamId || !streamType) return false;
      const normType = normalizeType(streamType);
      const targetId = String(streamId);
      return favorites.some(
        (f) => String(f.stream_id) === targetId && normalizeType(f.stream_type) === normType
      );
    },
    [favorites]
  );

  return {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    isFavorite,
    refreshFavorites: fetchFavorites,
  };
}
