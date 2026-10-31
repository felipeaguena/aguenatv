'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  ListPlus,
  PlaySquare,
  Edit2,
  Trash2,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Database,
  Link as LinkIcon,
  X,
  Sparkles,
  Shield,
  Film,
  Tv,
  Video,
  Layers,
  ChevronRight,
  Server,
} from 'lucide-react';
import {
  localDB,
  getSavedPlaylists,
  savePlaylist,
  deletePlaylist,
  setActivePlaylist,
  setLastSyncTime,
  getLastSyncTime,
} from '@/lib/db-local';
import { IPTVPlaylist, BaseStreamItem, SessionUser } from '@/lib/types';
import { initSearchIndex } from '@/lib/search-index';

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [playlists, setPlaylists] = useState<IPTVPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  // Estatísticas do Banco Local
  const [streamStats, setStreamStats] = useState({
    live: 0,
    movie: 0,
    series: 0,
    total: 0,
  });
  const [lastSyncFormatted, setLastSyncFormatted] = useState<string | null>(null);

  // Estados de Modais
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editPlaylist, setEditPlaylist] = useState<IPTVPlaylist | null>(null);

  // Form de Adicionar Lista
  const [formName, setFormName] = useState('');
  const [formM3uUrl, setFormM3uUrl] = useState('');
  const [formHost, setFormHost] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formSetActive, setFormSetActive] = useState(true);

  // Form de Edição
  const [editName, setEditName] = useState('');
  const [editM3uUrl, setEditM3uUrl] = useState('');
  const [editHost, setEditHost] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Notificações e Progresso de Sincronização
  const [syncingPlaylistId, setSyncingPlaylistId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Carrega dados do usuário e listas salvas
  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Usuário logado
      fetch('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) setCurrentUser(data.user);
        })
        .catch(() => {});

      // Listas de reprodução
      const saved = await getSavedPlaylists();
      setPlaylists(saved);

      // Estatísticas locais
      if (localDB) {
        const liveCount = await localDB.streams.where('stream_type').equals('live').count();
        const movieCount = await localDB.streams.where('stream_type').equals('movie').count();
        const seriesCount = await localDB.streams.where('stream_type').equals('series').count();
        setStreamStats({
          live: liveCount,
          movie: movieCount,
          series: seriesCount,
          total: liveCount + movieCount + seriesCount,
        });
      }

      const lastTs = await getLastSyncTime();
      if (lastTs) {
        setLastSyncFormatted(new Date(lastTs).toLocaleString('pt-BR'));
      }
    } catch (e) {
      console.error('Erro ao carregar configurações:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Parser inteligente para extrair Host, Usuário e Senha de URL M3U completa
  const handleParseM3U = (url: string, isEditing = false) => {
    if (isEditing) {
      setEditM3uUrl(url);
    } else {
      setFormM3uUrl(url);
    }

    if (!url.trim()) return;

    try {
      const parsed = new URL(url.trim());
      const u = parsed.searchParams.get('username');
      const p = parsed.searchParams.get('password');

      let parsedHost = `${parsed.protocol}//${parsed.hostname}`;
      if (parsed.port && parsed.port !== '80') {
        parsedHost += `:${parsed.port}`;
      } else if (parsed.hostname.includes('rootdns') || parsed.port === '80') {
        parsedHost += ':8080';
      }

      if (isEditing) {
        setEditHost(parsedHost);
        if (u) setEditUsername(u);
        if (p) setEditPassword(p);
      } else {
        setFormHost(parsedHost);
        if (u) setFormUsername(u);
        if (p) setFormPassword(p);
      }
    } catch {
      // Ignora erro se usuário ainda estiver digitando
    }
  };

  // Salva nova lista M3U
  const handleAddPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    let cleanHost = formHost.trim().replace(/\/+$/, '');
    if (cleanHost.endsWith(':80')) {
      cleanHost = cleanHost.replace(':80', ':8080');
    }

    const newPlaylist: IPTVPlaylist = {
      id: `list_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: formName.trim() || 'Minha Lista M3U',
      server_url: cleanHost,
      username: formUsername.trim(),
      password: formPassword.trim(),
      m3u_url: formM3uUrl.trim() || undefined,
      is_active: formSetActive || playlists.length === 0,
      created_at: new Date().toISOString(),
    };

    try {
      const updated = await savePlaylist(newPlaylist);
      setPlaylists(updated);
      setIsAddOpen(false);
      setFormName('');
      setFormM3uUrl('');
      setFormHost('');
      setFormUsername('');
      setFormPassword('');
      setSuccessMsg(`Lista "${newPlaylist.name}" adicionada com sucesso!`);

      // Se foi definida como ativa, sincroniza automaticamente
      if (newPlaylist.is_active) {
        handleSyncList(newPlaylist);
      }
    } catch {
      setErrorMsg('Erro ao salvar nova lista M3U.');
    }
  };

  // Atualiza lista M3U existente
  const handleUpdatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPlaylist) return;
    setErrorMsg('');
    setSuccessMsg('');

    let cleanHost = editHost.trim().replace(/\/+$/, '');
    if (cleanHost.endsWith(':80')) {
      cleanHost = cleanHost.replace(':80', ':8080');
    }

    const updatedItem: IPTVPlaylist = {
      ...editPlaylist,
      name: editName.trim() || editPlaylist.name,
      server_url: cleanHost,
      username: editUsername.trim(),
      password: editPassword.trim(),
      m3u_url: editM3uUrl.trim() || undefined,
      updated_at: new Date().toISOString(),
    };

    try {
      const updated = await savePlaylist(updatedItem);
      setPlaylists(updated);
      setEditPlaylist(null);
      setSuccessMsg(`Lista "${updatedItem.name}" atualizada com sucesso!`);

      // Se a lista editada for a ativa, pergunta ou re-sincroniza
      if (updatedItem.is_active) {
        handleSyncList(updatedItem);
      }
    } catch {
      setErrorMsg('Erro ao atualizar a lista M3U.');
    }
  };

  // Exclui uma lista
  const handleDeletePlaylist = async (playlist: IPTVPlaylist) => {
    if (
      !confirm(
        `Tem certeza que deseja remover a lista "${playlist.name}"? As configurações desta lista serão apagadas.`
      )
    ) {
      return;
    }

    try {
      const remaining = await deletePlaylist(playlist.id);
      setPlaylists(remaining);
      setSuccessMsg(`Lista "${playlist.name}" removida.`);
    } catch {
      setErrorMsg('Falha ao remover a lista.');
    }
  };

  // Ativa e sincroniza uma lista
  const handleActivateList = async (playlist: IPTVPlaylist) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const activated = await setActivePlaylist(playlist.id);
      if (activated) {
        const saved = await getSavedPlaylists();
        setPlaylists(saved);
        setSuccessMsg(`Lista "${activated.name}" definida como ativa.`);
        handleSyncList(activated);
      }
    } catch {
      setErrorMsg('Erro ao ativar a lista.');
    }
  };

  // Execução do processo completo de sincronização para a lista selecionada
  const handleSyncList = async (targetList: IPTVPlaylist) => {
    setSyncingPlaylistId(targetList.id);
    setErrorMsg('');
    setSyncProgress('Conectando ao servidor IPTV...');

    try {
      const fetchEndpoint = async (action: string) => {
        const url = `/api/iptv?host=${encodeURIComponent(
          targetList.server_url
        )}&username=${encodeURIComponent(targetList.username)}&password=${encodeURIComponent(
          targetList.password
        )}&action=${action}`;

        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Falha na requisição: ${action} (${res.status})`);
        }
        return res.json();
      };

      // 1. Busca Categorias
      setSyncProgress('Carregando categorias...');
      const [liveCats, vodCats, seriesCats] = await Promise.all([
        fetchEndpoint('get_live_categories').catch(() => []),
        fetchEndpoint('get_vod_categories').catch(() => []),
        fetchEndpoint('get_series_categories').catch(() => []),
      ]);

      if (localDB) {
        await localDB.categories.clear();
        const catMap = new Map<string, string>();

        const formattedCats = [
          ...liveCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return {
              category_id: String(c.category_id),
              category_name: c.category_name,
              type: 'live' as const,
            };
          }),
          ...vodCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return {
              category_id: String(c.category_id),
              category_name: c.category_name,
              type: 'movie' as const,
            };
          }),
          ...seriesCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return {
              category_id: String(c.category_id),
              category_name: c.category_name,
              type: 'series' as const,
            };
          }),
        ];
        await localDB.categories.bulkPut(formattedCats);

        // 2. Busca Canais, Filmes e Séries
        setSyncProgress('Buscando canais, filmes e séries...');
        const [liveStreams, vodStreams, seriesList] = await Promise.all([
          fetchEndpoint('get_live_streams'),
          fetchEndpoint('get_vod_streams').catch(() => []),
          fetchEndpoint('get_series').catch(() => []),
        ]);

        if (!Array.isArray(liveStreams) || liveStreams.length === 0) {
          throw new Error(
            'Nenhum canal foi retornado pelo servidor. Verifique o endereço e credenciais.'
          );
        }

        setSyncProgress(
          `Processando ${liveStreams.length} canais, ${vodStreams.length || 0} filmes e ${
            seriesList.length || 0
          } séries...`
        );

        const allItems: BaseStreamItem[] = [];

        // Canais
        liveStreams.forEach((item: any) => {
          allItems.push({
            id: `live_${item.stream_id}`,
            stream_id: String(item.stream_id),
            name: item.name,
            title: item.name,
            stream_type: 'live',
            stream_icon: item.stream_icon,
            category_id: String(item.category_id),
            category_name: catMap.get(String(item.category_id)) || 'Canais',
            container_extension: 'm3u8',
            ...({
              url: `${targetList.server_url}/live/${targetList.username}/${targetList.password}/${item.stream_id}.m3u8`,
            } as any),
          });
        });

        // Filmes
        if (Array.isArray(vodStreams)) {
          vodStreams.forEach((item: any) => {
            allItems.push({
              id: `movie_${item.stream_id}`,
              stream_id: String(item.stream_id),
              name: item.name,
              title: item.name,
              stream_type: 'movie',
              stream_icon: item.stream_icon,
              category_id: String(item.category_id),
              category_name: catMap.get(String(item.category_id)) || 'Filmes',
              container_extension: item.container_extension || 'mp4',
              rating: item.rating,
              added: item.added,
              ...({
                url: `${targetList.server_url}/movie/${targetList.username}/${targetList.password}/${
                  item.stream_id
                }.${item.container_extension || 'mp4'}`,
              } as any),
            });
          });
        }

        // Séries
        if (Array.isArray(seriesList)) {
          seriesList.forEach((item: any) => {
            allItems.push({
              id: `series_${item.series_id}`,
              stream_id: String(item.series_id),
              name: item.name,
              title: item.name,
              stream_type: 'series',
              stream_icon: item.cover,
              category_id: String(item.category_id),
              category_name: catMap.get(String(item.category_id)) || 'Séries',
              rating: item.rating,
            });
          });
        }

        setSyncProgress('Salvando catálogo no banco de dados local (IndexedDB)...');
        await localDB.streams.clear();
        await localDB.streams.bulkPut(allItems);

        const now = Date.now();
        await setLastSyncTime(now);

        // Atualiza índices em memória
        initSearchIndex(allItems);

        // Atualiza informações na playlist
        const updatedList: IPTVPlaylist = {
          ...targetList,
          last_synced: now,
          channels_count: liveStreams.length,
          movies_count: Array.isArray(vodStreams) ? vodStreams.length : 0,
          series_count: Array.isArray(seriesList) ? seriesList.length : 0,
        };
        const savedPlaylists = await savePlaylist(updatedList);
        setPlaylists(savedPlaylists);

        setStreamStats({
          live: liveStreams.length,
          movie: Array.isArray(vodStreams) ? vodStreams.length : 0,
          series: Array.isArray(seriesList) ? seriesList.length : 0,
          total: allItems.length,
        });
        setLastSyncFormatted(new Date(now).toLocaleString('pt-BR'));
        setSuccessMsg(
          `Sincronização concluída com sucesso! ${allItems.length} itens prontos para reprodução instantânea.`
        );
      }
    } catch (err: any) {
      console.error('Erro na sincronização:', err);
      setErrorMsg(err.message || 'Falha ao sincronizar lista com o servidor.');
    } finally {
      setSyncingPlaylistId(null);
      setSyncProgress('');
    }
  };

  // Limpar todo o cache local
  const handleClearCache = async () => {
    if (
      !confirm(
        'Deseja limpar todo o cache local de canais e filmes? Será necessário sincronizar a lista ativa novamente.'
      )
    ) {
      return;
    }

    try {
      if (localDB) {
        await localDB.streams.clear();
        await localDB.categories.clear();
        await localDB.settings.delete('last_sync_timestamp');
        setStreamStats({ live: 0, movie: 0, series: 0, total: 0 });
        setLastSyncFormatted(null);
        setSuccessMsg('Cache local limpo com sucesso.');
      }
    } catch {
      setErrorMsg('Falha ao limpar cache local.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Settings className="w-6 h-6 text-violet-400" />
            Configurações do Sistema
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Gerencie suas listas M3U, servidores IPTV e armazenamento local com controle total.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition flex items-center gap-2 cursor-pointer w-fit"
        >
          <ListPlus className="w-4 h-4" />
          Adicionar Nova Lista M3U
        </button>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-3 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span className="flex-1">{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. SEÇÃO PRINCIPAL: GERENCIAMENTO DE LISTAS M3U */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-violet-400" />
            <h2 className="text-base font-bold text-white">Minhas Listas M3U & Servidores IPTV</h2>
          </div>
          <span className="text-xs text-neutral-400 font-medium">
            {playlists.length} {playlists.length === 1 ? 'lista cadastrada' : 'listas cadastradas'}
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs text-neutral-400 space-y-2 bg-[#13141b] rounded-2xl border border-white/10">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando listas salvas...</p>
          </div>
        ) : playlists.length === 0 ? (
          <div className="p-12 text-center bg-[#13141b] rounded-2xl border border-white/10 space-y-3">
            <PlaySquare className="w-10 h-10 text-neutral-600 mx-auto" />
            <h3 className="text-sm font-bold text-neutral-200">Nenhuma lista M3U cadastrada</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto">
              Adicione a URL M3U completa ou as credenciais Xtream do seu servidor para começar a
              assistir.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="mt-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition inline-flex items-center gap-2"
            >
              <ListPlus className="w-4 h-4" />
              Adicionar Primeira Lista
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {playlists.map((playlist) => {
              const isSyncing = syncingPlaylistId === playlist.id;

              return (
                <div
                  key={playlist.id}
                  className={`p-5 rounded-2xl bg-[#13141b] border transition-all flex flex-col justify-between gap-4 relative overflow-hidden ${
                    playlist.is_active
                      ? 'border-violet-500/50 shadow-xl shadow-violet-600/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Status Ativa / Inativa */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-white">{playlist.name}</h3>
                        {playlist.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Lista Ativa
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/5 text-neutral-400 border border-white/10">
                            Inativa
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-neutral-400 font-mono truncate max-w-sm">
                        {playlist.server_url}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        Usuário: <span className="text-neutral-300 font-medium">@{playlist.username}</span>
                      </p>
                    </div>

                    {/* Botões de Ação da Lista */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditPlaylist(playlist);
                          setEditName(playlist.name);
                          setEditM3uUrl(playlist.m3u_url || '');
                          setEditHost(playlist.server_url);
                          setEditUsername(playlist.username);
                          setEditPassword(playlist.password);
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 transition"
                        title="Editar lista"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeletePlaylist(playlist)}
                        disabled={playlist.is_active && playlists.length === 1}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title={
                          playlist.is_active && playlists.length === 1
                            ? 'Você não pode excluir sua única lista ativa'
                            : 'Excluir lista'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Resumo de Contagem de Itens */}
                  <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-[#0b0c10] border border-white/5 text-center">
                    <div>
                      <span className="block text-[10px] text-neutral-500 uppercase font-semibold">
                        Canais
                      </span>
                      <span className="text-xs font-bold text-violet-400">
                        {playlist.channels_count || (playlist.is_active ? streamStats.live : 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-neutral-500 uppercase font-semibold">
                        Filmes
                      </span>
                      <span className="text-xs font-bold text-indigo-400">
                        {playlist.movies_count || (playlist.is_active ? streamStats.movie : 0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-neutral-500 uppercase font-semibold">
                        Séries
                      </span>
                      <span className="text-xs font-bold text-emerald-400">
                        {playlist.series_count || (playlist.is_active ? streamStats.series : 0)}
                      </span>
                    </div>
                  </div>

                  {/* Rodapé do Card: Sincronização ou Ativação */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[11px] text-neutral-500">
                      {playlist.last_synced
                        ? `Sincronizada em ${new Date(playlist.last_synced).toLocaleDateString('pt-BR')}`
                        : 'Ainda não sincronizada'}
                    </span>

                    <div className="flex items-center gap-2">
                      {!playlist.is_active && (
                        <button
                          onClick={() => handleActivateList(playlist)}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-200 text-xs font-semibold border border-white/10 transition"
                        >
                          Tornar Ativa
                        </button>
                      )}

                      <button
                        onClick={() => handleSyncList(playlist)}
                        disabled={isSyncing}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md ${
                          playlist.is_active
                            ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/30'
                            : 'bg-white/10 hover:bg-white/15 text-neutral-200'
                        }`}
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Barra de Progresso no Card se estiver sincronizando */}
                  {isSyncing && (
                    <div className="p-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-xs text-violet-300 flex items-center gap-2 animate-pulse">
                      <RotateCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span className="truncate">{syncProgress}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. SEÇÃO: ESTATÍSTICAS E CACHE DO INDEXEDDB */}
      <section className="p-6 rounded-3xl bg-[#13141b] border border-white/10 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-white">Cache & Armazenamento Local</h2>
              <p className="text-xs text-neutral-400">
                Os dados são indexados no navegador para buscas e reprodução instantânea com zero
                atraso.
              </p>
            </div>
          </div>

          <button
            onClick={handleClearCache}
            className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-semibold transition"
          >
            Limpar Todo o Cache Local
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center shrink-0">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block">Canais Ativos</span>
              <span className="text-base font-extrabold text-white">{streamStats.live}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center shrink-0">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block">Filmes VOD</span>
              <span className="text-base font-extrabold text-white">{streamStats.movie}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block">Séries</span>
              <span className="text-base font-extrabold text-white">{streamStats.series}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#0b0c10] border border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-neutral-400 block">Última Sincronização</span>
              <span className="text-[11px] font-bold text-neutral-200">
                {lastSyncFormatted || 'Nunca'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. SEÇÃO: PERFIL & ADMINISTRAÇÃO */}
      {currentUser && (
        <section className="p-6 rounded-3xl bg-[#13141b] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white font-extrabold text-sm shadow-lg shadow-violet-600/30 shrink-0">
              {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : 'US'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">{currentUser.displayName}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30">
                  {currentUser.role}
                </span>
              </div>
              <p className="text-xs text-neutral-400">Login autenticado: @{currentUser.username}</p>
            </div>
          </div>

          {currentUser.role === 'admin' && (
            <Link
              href="/admin/users"
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-200 hover:text-white border border-white/10 text-xs font-semibold transition flex items-center gap-2 w-fit"
            >
              <Shield className="w-4 h-4 text-violet-400" />
              <span>Gerenciar Usuários</span>
              <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
            </Link>
          )}
        </section>
      )}

      {/* MODAL: ADICIONAR NOVA LISTA M3U */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <ListPlus className="w-5 h-5 text-violet-400" />
              Adicionar Nova Lista M3U
            </h2>
            <p className="text-xs text-neutral-400 mb-5">
              Cole o link M3U completo para preenchimento automático ou digite o Host, Usuário e
              Senha manualmente.
            </p>

            <form onSubmit={handleAddPlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Nome Amigável da Lista
                </label>
                <input
                  type="text"
                  placeholder="ex: Minha Lista Principal, Esportes 4K"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Parser M3U Inteligente */}
              <div className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/20 space-y-2">
                <label className="block text-xs font-bold text-violet-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" />
                  Link M3U Completo (Preenchimento Automático)
                </label>
                <input
                  type="url"
                  placeholder="http://servidor:porta/get.php?username=...&password=..."
                  value={formM3uUrl}
                  onChange={(e) => handleParseM3U(e.target.value, false)}
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                />
                <span className="text-[10px] text-neutral-400 block">
                  Ao colar o link, o sistema extrai o Host, Usuário e Senha automaticamente.
                </span>
              </div>

              {/* Campos Xtream */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Servidor / Host (com porta)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: http://meu-servidor.com:8080"
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    required
                    className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Usuário
                    </label>
                    <input
                      type="text"
                      placeholder="Username"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value)}
                      required
                      className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Senha
                    </label>
                    <input
                      type="password"
                      placeholder="Password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      required
                      className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="setActiveCheck"
                  checked={formSetActive}
                  onChange={(e) => setFormSetActive(e.target.checked)}
                  className="w-4 h-4 accent-violet-600 rounded"
                />
                <label htmlFor="setActiveCheck" className="text-xs text-neutral-300 cursor-pointer">
                  Definir esta lista como ativa e sincronizar agora
                </label>
              </div>

              <div className="pt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white shadow-lg shadow-violet-600/30 transition"
                >
                  Salvar Lista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR LISTA M3U EXISTENTE */}
      {editPlaylist && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setEditPlaylist(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-violet-400" />
              Editar Lista: {editPlaylist.name}
            </h2>
            <p className="text-xs text-neutral-400 mb-5">
              Atualize as informações de conexão do servidor IPTV ou link M3U desta lista.
            </p>

            <form onSubmit={handleUpdatePlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Nome da Lista
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              {/* Parser M3U Inteligente */}
              <div className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/20 space-y-2">
                <label className="block text-xs font-bold text-violet-300 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" />
                  Atualizar via Link M3U Completo
                </label>
                <input
                  type="url"
                  placeholder="http://servidor:porta/get.php?username=...&password=..."
                  value={editM3uUrl}
                  onChange={(e) => handleParseM3U(e.target.value, true)}
                  className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              {/* Campos Xtream */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Servidor / Host (com porta)
                  </label>
                  <input
                    type="text"
                    value={editHost}
                    onChange={(e) => setEditHost(e.target.value)}
                    required
                    className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Usuário
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      required
                      className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Senha
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      required
                      className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditPlaylist(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-bold text-white shadow-lg shadow-violet-600/30 transition"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
