'use client';
import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { FavoriteItem, StreamType } from '@/lib/types';
import { createSyncedListStore, normalizeStreamType } from '@/lib/synced-list-store';

const EMPTY_FAVORITES: FavoriteItem[] = [];

const favoritesStore = createSyncedListStore<FavoriteItem>({
  storagePrefix: 'miruro_fav_',
  fallbackStorageKey: 'miruro_local_favorites',
  apiEndpoint: '/api/favorites',
  extractItems: (data) => (Array.isArray(data.favorites) ? (data.favorites as FavoriteItem[]) : []),
  buildKey: (f) => `${normalizeStreamType(f.stream_type)}_${String(f.stream_id)}`,
});

export function resetFavoritesCache() {
  favoritesStore.reset();
}

export function useFavorites() {
  const favorites = useSyncExternalStore(
    favoritesStore.subscribe,
    favoritesStore.getItems,
    () => EMPTY_FAVORITES
  );
  const [loading, setLoading] = useState(() => !favoritesStore.isLoaded());

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      favoritesStore.hydrateFromStorage();
      if (favoritesStore.isLoaded()) {
        setLoading(false);
      }
    });

    favoritesStore.syncFromServer().finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const fetchFavorites = useCallback(async (force = false) => {
    try {
      await favoritesStore.syncFromServer(force);
    } finally {
      setLoading(false);
    }
  }, []);

  const addFavorite = useCallback(
    async (item: {
      streamId: string | number;
      streamType: StreamType | string;
      title: string;
      posterUrl?: string;
      categoryName?: string;
      rating?: string | number;
    }) => {
      const normType = normalizeStreamType(item.streamType) as StreamType;
      const targetId = String(item.streamId);
      const userId = favoritesStore.getUserId();

      const tempItem: FavoriteItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: userId || 'me',
        stream_id: targetId,
        stream_type: normType,
        title: item.title,
        poster_url: item.posterUrl,
        category_name: item.categoryName,
        rating: item.rating ? String(item.rating) : undefined,
        created_at: new Date().toISOString(),
      };

      const filtered = favoritesStore
        .getItems()
        .filter((f) => !(String(f.stream_id) === targetId && normalizeStreamType(f.stream_type) === normType));
      const next = [tempItem, ...filtered];
      favoritesStore.updateItems(next, userId);

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
            const updated = favoritesStore
              .getItems()
              .map((f) =>
                String(f.stream_id) === targetId && normalizeStreamType(f.stream_type) === normType
                  ? data.favorite
                  : f
              );
            favoritesStore.updateItems(updated, data.userId || userId);
          }
        }
      } catch (err) {
        console.warn('[useFavorites] Erro ao sincronizar adição com a API:', err);
      }
    },
    []
  );

  const removeFavorite = useCallback(async (streamId: string | number, streamType: string) => {
    const normType = normalizeStreamType(streamType);
    const targetId = String(streamId);
    const userId = favoritesStore.getUserId();

    const next = favoritesStore
      .getItems()
      .filter((f) => !(String(f.stream_id) === targetId && normalizeStreamType(f.stream_type) === normType));
    favoritesStore.updateItems(next, userId);

    try {
      await fetch(`/api/favorites?streamId=${targetId}&streamType=${normType}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('[useFavorites] Erro ao sincronizar remoção com a API:', e);
    }
  }, []);

  const isFavorite = useCallback((streamId?: string | number, streamType?: string) => {
    if (!streamId || !streamType) return false;
    return favoritesStore.getKeySet().has(`${normalizeStreamType(streamType)}_${String(streamId)}`);
  }, []);

  return {
    favorites,
    loading,
    addFavorite,
    removeFavorite,
    isFavorite,
    refreshFavorites: fetchFavorites,
  };
}
