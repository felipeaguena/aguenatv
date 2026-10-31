import Dexie, { Table } from 'dexie';
import { BaseStreamItem, Category, IPTVAccount, IPTVPlaylist } from './types';

export interface LocalStream extends BaseStreamItem {
  id?: number | string;
}

export interface LocalCategory extends Category {
  type: 'live' | 'movie' | 'series';
}

export interface AppSetting {
  key: string;
  value: any;
}

export class IPTVLocalDatabase extends Dexie {
  streams!: Table<LocalStream, number | string>;
  categories!: Table<LocalCategory, string>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super('IPTV_Miruro_LocalDB');
    this.version(1).stores({
      streams: '++id, stream_id, stream_type, category_id, title, name',
      categories: 'category_id, type, category_name',
      settings: 'key',
    });
  }
}

export const localDB = typeof window !== 'undefined' ? new IPTVLocalDatabase() : (null as unknown as IPTVLocalDatabase);

export const DEFAULT_TTL_HOURS = 12;

export async function getLastSyncTime(): Promise<number | null> {
  if (!localDB) return null;
  const setting = await localDB.settings.get('last_sync_timestamp');
  return setting ? Number(setting.value) : null;
}

export async function isSyncNeeded(ttlHours = DEFAULT_TTL_HOURS): Promise<boolean> {
  const lastSync = await getLastSyncTime();
  if (!lastSync) return true;
  const now = Date.now();
  const maxAge = ttlHours * 60 * 60 * 1000;
  return now - lastSync > maxAge;
}

export async function setLastSyncTime(timestamp = Date.now()): Promise<void> {
  if (!localDB) return;
  await localDB.settings.put({ key: 'last_sync_timestamp', value: timestamp });
}

export async function getSavedIPTVConfig(): Promise<IPTVAccount | null> {
  if (!localDB) return null;

  // 1. Tenta carregar a configuração direta do cache
  const setting = await localDB.settings.get('iptv_config');
  if (setting?.value && setting.value.server_url && setting.value.username) {
    return setting.value as IPTVAccount;
  }

  // 2. Fallback resiliente: busca na lista de playlists ativas ou na primeira cadastrada
  try {
    const lists = await getSavedPlaylists();
    const active = lists.find((l) => l.is_active) || lists[0];
    if (active && active.server_url && active.username) {
      const recovered: IPTVAccount = {
        server_url: active.server_url,
        username: active.username,
        password: active.password,
      };
      await localDB.settings.put({ key: 'iptv_config', value: recovered });
      return recovered;
    }
  } catch (err) {
    console.warn('[db-local] Erro ao recuperar playlist ativa:', err);
  }

  return null;
}

export async function saveIPTVConfig(config: IPTVAccount): Promise<void> {
  if (!localDB) return;
  await localDB.settings.put({ key: 'iptv_config', value: config });
}

// ==========================================
// Gerenciamento de Múltiplas Listas M3U / IPTV
// ==========================================

export async function getSavedPlaylists(): Promise<IPTVPlaylist[]> {
  if (!localDB) return [];
  const setting = await localDB.settings.get('iptv_playlists');
  let lists = setting?.value as IPTVPlaylist[] | undefined;

  // Migração transparente da lista única anterior para o modelo de múltiplas listas
  if (!lists || !Array.isArray(lists) || lists.length === 0) {
    const currentCfg = await getSavedIPTVConfig();
    if (currentCfg && currentCfg.server_url) {
      const defaultList: IPTVPlaylist = {
        id: 'default_list',
        name: 'Lista Atual',
        server_url: currentCfg.server_url,
        username: currentCfg.username,
        password: currentCfg.password,
        is_active: true,
        created_at: new Date().toISOString(),
        last_synced: (await getLastSyncTime()) || undefined,
      };
      lists = [defaultList];
      await localDB.settings.put({ key: 'iptv_playlists', value: lists });
    } else {
      lists = [];
    }
  }

  return lists;
}

export async function savePlaylists(lists: IPTVPlaylist[]): Promise<void> {
  if (!localDB) return;
  await localDB.settings.put({ key: 'iptv_playlists', value: lists });
}

export async function savePlaylist(playlist: IPTVPlaylist): Promise<IPTVPlaylist[]> {
  const lists = await getSavedPlaylists();
  const index = lists.findIndex((p) => p.id === playlist.id);

  let updatedLists = [...lists];
  if (index >= 0) {
    updatedLists[index] = {
      ...updatedLists[index],
      ...playlist,
      updated_at: new Date().toISOString(),
    };
  } else {
    updatedLists.push(playlist);
  }

  // Se a lista foi definida como ativa, desativa as outras e atualiza iptv_config
  if (playlist.is_active) {
    updatedLists = updatedLists.map((p) => ({
      ...p,
      is_active: p.id === playlist.id,
    }));
    await saveIPTVConfig({
      server_url: playlist.server_url,
      username: playlist.username,
      password: playlist.password,
    });
  }

  await savePlaylists(updatedLists);
  return updatedLists;
}

export async function setActivePlaylist(id: string): Promise<IPTVPlaylist | null> {
  const lists = await getSavedPlaylists();
  const target = lists.find((p) => p.id === id);
  if (!target) return null;

  const updatedLists = lists.map((p) => ({
    ...p,
    is_active: p.id === id,
  }));

  await savePlaylists(updatedLists);
  await saveIPTVConfig({
    server_url: target.server_url,
    username: target.username,
    password: target.password,
  });

  return target;
}

export async function deletePlaylist(id: string): Promise<IPTVPlaylist[]> {
  const lists = await getSavedPlaylists();
  const filtered = lists.filter((p) => p.id !== id);

  // Se a lista ativa foi excluída e ainda restam outras listas, torna a primeira ativa
  const wasActive = lists.find((p) => p.id === id)?.is_active;
  if (wasActive && filtered.length > 0) {
    filtered[0].is_active = true;
    await saveIPTVConfig({
      server_url: filtered[0].server_url,
      username: filtered[0].username,
      password: filtered[0].password,
    });
  }

  await savePlaylists(filtered);
  return filtered;
}
