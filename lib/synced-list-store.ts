/**
 * Store singleton em memória compartilhado entre todos os componentes para listas sincronizadas
 * (Favoritos / Assistidos), evitando múltiplos JSON.parse no localStorage e oferecendo lookup O(1).
 */

export function normalizeStreamType(t: string): string {
  return t === 'movies' ? 'movie' : t;
}

export interface SyncedListStoreConfig<T> {
  storagePrefix: string;
  fallbackStorageKey: string;
  apiEndpoint: string;
  extractItems: (payload: Record<string, unknown>) => T[];
  buildKey: (item: T) => string | null;
  cacheTtlMs?: number;
}

export interface SyncedListStore<T> {
  subscribe: (listener: () => void) => () => void;
  getItems: () => T[];
  getKeySet: () => Set<string>;
  getUserId: () => string | null;
  isLoaded: () => boolean;
  hydrateFromStorage: () => void;
  syncFromServer: (force?: boolean) => Promise<T[]>;
  updateItems: (next: T[], userId?: string | null) => void;
  reset: () => void;
}

export function createSyncedListStore<T>(
  config: SyncedListStoreConfig<T>
): SyncedListStore<T> {
  const ttlMs = config.cacheTtlMs ?? 60_000;
  const emptyList: T[] = [];

  let itemsCache: T[] | null = null;
  let keySet = new Set<string>();
  let currentUserId: string | null = null;
  let lastFetchTs = 0;
  let inFlight: Promise<T[]> | null = null;
  let storageListenerAttached = false;
  const listeners = new Set<() => void>();

  const ACTIVE_UID_KEY = 'aguenatv_active_uid';

  const getActiveUid = (): string | null => {
    if (currentUserId) return currentUserId;
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(ACTIVE_UID_KEY);
    } catch {
      return null;
    }
  };

  const getStorageKey = (userId?: string | null): string | null => {
    const uid = userId || getActiveUid();
    return uid ? `${config.storagePrefix}${uid}` : null;
  };

  const rebuildKeySet = (list: T[]) => {
    const nextKeys = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const k = config.buildKey(list[i]);
      if (k) nextKeys.add(k);
    }
    keySet = nextKeys;
  };

  const notifyListeners = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        // Ignora erro isolado de listener desmontado
      }
    }
  };

  const applyList = (next: T[], userId?: string | null, persist = true) => {
    itemsCache = next;
    lastFetchTs = Date.now();
    if (userId) currentUserId = userId;
    rebuildKeySet(next);

    if (persist && typeof window !== 'undefined') {
      try {
        if (currentUserId) {
          localStorage.setItem(ACTIVE_UID_KEY, currentUserId);
        }
        const key = getStorageKey(currentUserId);
        if (key) {
          localStorage.setItem(key, JSON.stringify(next));
        }
        // Remove legado compartilhado para impedir vazamento entre contas
        localStorage.removeItem(config.fallbackStorageKey);
      } catch {
        // Ignora cota de localStorage
      }
    }

    notifyListeners();
  };

  const attachCrossTabListener = () => {
    if (storageListenerAttached || typeof window === 'undefined') return;
    storageListenerAttached = true;
    window.addEventListener('storage', (event: StorageEvent) => {
      const key = getStorageKey(currentUserId);
      if (!key || event.key !== key || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as T[];
        if (Array.isArray(parsed)) {
          applyList(parsed, currentUserId, false);
        }
      } catch {
        // Ignora JSON inválido vindo de outra aba
      }
    });
  };

  const hydrateFromStorage = () => {
    if (typeof window === 'undefined') return;
    attachCrossTabListener();
    if (itemsCache !== null) return;

    try {
      const key = getStorageKey(currentUserId);
      if (!key) return;
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T[];
        if (Array.isArray(parsed)) {
          itemsCache = parsed;
          rebuildKeySet(parsed);
          notifyListeners();
        }
      }
    } catch {
      // Ignora erro de leitura no localStorage
    }
  };

  const syncFromServer = async (force = false): Promise<T[]> => {
    const now = Date.now();
    if (!force && itemsCache !== null && now - lastFetchTs < ttlMs) {
      return itemsCache;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = (async () => {
      try {
        const res = await fetch(config.apiEndpoint, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          const serverItems = config.extractItems(data);
          const resUserId = typeof data.userId === 'string' && data.userId ? data.userId : null;
          const previousUid = getActiveUid();

          if (resUserId && previousUid && resUserId !== previousUid) {
            itemsCache = null;
            keySet = new Set<string>();
          }
          if (resUserId) {
            currentUserId = resUserId;
          }
          applyList(serverItems, resUserId, true);
          return serverItems;
        }
      } catch (err) {
        console.warn(`[SyncedListStore] Erro ao sincronizar ${config.apiEndpoint}:`, err);
      } finally {
        inFlight = null;
      }
      return itemsCache ?? emptyList;
    })();

    return inFlight;
  };

  const reset = () => {
    itemsCache = null;
    keySet = new Set<string>();
    currentUserId = null;
    lastFetchTs = 0;
    inFlight = null;
    notifyListeners();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getItems: () => itemsCache ?? emptyList,
    getKeySet: () => keySet,
    getUserId: () => currentUserId,
    isLoaded: () => itemsCache !== null,
    hydrateFromStorage,
    syncFromServer,
    updateItems: (next: T[], userId?: string | null) => applyList(next, userId, true),
    reset,
  };
}
