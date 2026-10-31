'use client';
import { useState, useEffect, useCallback } from 'react';
import { FavoriteItem, StreamType } from '@/lib/types';

const STORAGE_KEY = 'miruro_local_favorites';
const EVENT_NAME = 'miruro_favorites_updated';

function normalizeType(t: string): string {
  if (t === 'movies') return 'movie';
  return t;
}

// Cache em memória a nível de módulo (compartilhado entre todas as instâncias)
let globalFavoritesCache: FavoriteItem[] | null = null;
let lastFavoritesFetch = 0;
let favoritesInFlight: Promise<FavoriteItem[]> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos de cooldown entre chamadas à API

/**
 * Atualiza o cache global, localStorage e notifica outros componentes assincronamente
 * via setTimeout para NUNCA conflitar com a renderização do React.
 */
function broadcastFavoritesUpdated(next: FavoriteItem[]) {
  globalFavoritesCache = next;
  lastFavoritesFetch = Date.now();
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
        broadcastFavoritesUpdated(serverFavs);
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
    // Retorna o cache em memória caso já tenha sido carregado em navegação client-side
    return globalFavoritesCache || [];
  });
  const [loading, setLoading] = useState(!globalFavoritesCache);

  // Sincroniza com /api/favorites (que salva em disco local ou Supabase)
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

  // Carrega ao montar e sincroniza com eventos de abas/outros componentes
  useEffect(() => {
    // Restaura do localStorage no cliente logo após a hidratação se o cache global ainda estiver vazio
    if (!globalFavoritesCache && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
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
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed: FavoriteItem[] = JSON.parse(cached);
          globalFavoritesCache = parsed;
          setFavorites(parsed);
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
        user_id: 'me',
        stream_id: targetId,
        stream_type: normType,
        title: item.title,
        poster_url: item.posterUrl,
        category_name: item.categoryName,
        rating: item.rating ? String(item.rating) : undefined,
        created_at: new Date().toISOString(),
      };

      // 1. Calcula o próximo estado a partir da lista mais atualizada
      const currentList = globalFavoritesCache || favorites;
      const filtered = currentList.filter(
        (f) => !(String(f.stream_id) === targetId && normalizeType(f.stream_type) === normType)
      );
      const next = [tempItem, ...filtered];

      // 2. Atualização otimista imediata no componente atual
      setFavorites(next);

      // 3. Atualiza cache em memória, localStorage e notifica outros componentes
      broadcastFavoritesUpdated(next);

      // 4. Persistência na API (servidor local ou Supabase)
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
            broadcastFavoritesUpdated(updated);
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

      // Atualização imediata
      setFavorites(next);
      broadcastFavoritesUpdated(next);

      // Remoção na API
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
