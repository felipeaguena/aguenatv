'use client';
import { useState, useEffect } from 'react';
import { RotateCw, AlertCircle, Database, X, Link as LinkIcon, Sparkles } from 'lucide-react';
import {
  localDB,
  getSavedIPTVConfig,
  saveIPTVConfig,
  setLastSyncTime,
  getLastSyncTime,
} from '@/lib/db-local';
import { initSearchIndex } from '@/lib/search-index';
import { BaseStreamItem, IPTVAccount } from '@/lib/types';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export default function SyncModal({ isOpen, onClose, onSyncComplete }: SyncModalProps) {
  const [m3uUrlInput, setM3uUrlInput] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastSyncStr, setLastSyncStr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getSavedIPTVConfig().then((cfg) => {
        if (cfg) {
          setHost(cfg.server_url);
          setUsername(cfg.username);
          setPassword(cfg.password);
        }
      });

      getLastSyncTime().then((ts) => {
        if (ts) {
          setLastSyncStr(new Date(ts).toLocaleString('pt-BR'));
        }
      });
    }
  }, [isOpen]);

  // Parser inteligente para extrair Host, Usuário e Senha de uma URL M3U completa
  const handleParseM3U = (url: string) => {
    setM3uUrlInput(url);
    if (!url.trim()) return;

    try {
      const parsed = new URL(url.trim());
      const u = parsed.searchParams.get('username');
      const p = parsed.searchParams.get('password');

      let parsedHost = `${parsed.protocol}//${parsed.hostname}`;
      if (parsed.port) {
        parsedHost += `:${parsed.port}`;
      }

      setHost(parsedHost);
      if (u) setUsername(u);
      if (p) setPassword(p);
    } catch {
      // Se não for uma URL válida completa, ignora
    }
  };

  if (!isOpen) return null;

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSyncing(true);
    setProgressMsg('Iniciando comunicação com o servidor...');

    try {
      // Preserva exatamente a porta digitada pelo usuário
      let cleanHost = host.trim().replace(/\/+$/, '');

      const config: IPTVAccount = {
        server_url: cleanHost,
        username: username.trim(),
        password: password.trim(),
      };
      await saveIPTVConfig(config);

      const fetchEndpoint = async (action: string) => {
        const url = `/api/iptv?host=${encodeURIComponent(config.server_url)}&username=${encodeURIComponent(
          config.username
        )}&password=${encodeURIComponent(config.password)}&action=${action}`;

        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Falha ao obter ${action} (Status HTTP ${res.status})`);
        }
        return res.json();
      };

      // 1. Busca Categorias
      setProgressMsg('Buscando categorias do servidor...');
      const [liveCats, vodCats, seriesCats] = await Promise.all([
        fetchEndpoint('get_live_categories').catch((err) => {
          console.warn('Erro em live categories:', err);
          return [];
        }),
        fetchEndpoint('get_vod_categories').catch(() => []),
        fetchEndpoint('get_series_categories').catch(() => []),
      ]);

      if (localDB) {
        await localDB.categories.clear();
        const catMap = new Map<string, string>();

        const formattedCats = [
          ...liveCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return { category_id: String(c.category_id), category_name: c.category_name, type: 'live' as const };
          }),
          ...vodCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return { category_id: String(c.category_id), category_name: c.category_name, type: 'movie' as const };
          }),
          ...seriesCats.map((c: any) => {
            catMap.set(String(c.category_id), c.category_name);
            return { category_id: String(c.category_id), category_name: c.category_name, type: 'series' as const };
          }),
        ];
        await localDB.categories.bulkPut(formattedCats);

        // 2. Busca Canais e VODs
        setProgressMsg('Buscando canais ao vivo e filmes...');
        const [liveStreams, vodStreams, seriesList] = await Promise.all([
          fetchEndpoint('get_live_streams'),
          fetchEndpoint('get_vod_streams').catch(() => []),
          fetchEndpoint('get_series').catch(() => []),
        ]);

        if (!Array.isArray(liveStreams) || liveStreams.length === 0) {
          throw new Error(
            'Nenhum canal foi retornado pelo servidor. Verifique se o endereço e credenciais estão corretos.'
          );
        }

        setProgressMsg(`Processando ${liveStreams.length} canais e ${vodStreams.length || 0} filmes...`);

        const allItems: BaseStreamItem[] = [];

        // Canais de TV
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
              url: `${config.server_url}/live/${config.username}/${config.password}/${item.stream_id}.m3u8`,
            } as any),
          });
        });

        // Filmes (VOD)
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
              rating: item.rating,
              added: item.added || item.last_modified || '',
              container_extension: item.container_extension || 'mp4',
              ...({
                url: `${config.server_url}/movie/${config.username}/${config.password}/${item.stream_id}.${item.container_extension || 'mp4'}`,
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
              added: item.last_modified || item.added || '',
            });
          });
        }

        setProgressMsg(`Gravando ${allItems.length} itens no banco local...`);
        await localDB.streams.clear();
        await localDB.streams.bulkPut(allItems);
        await setLastSyncTime(Date.now());

        // Inicializa o motor de busca aproximada (Fuzzy) em memória
        initSearchIndex(allItems);
      }

      setProgressMsg('Sincronização concluída com sucesso!');
      setTimeout(() => {
        setSyncing(false);
        onClose();
        if (onSyncComplete) onSyncComplete();
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao sincronizar com servidor IPTV');
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Configuração e Sincronização</h2>
            <p className="text-xs text-neutral-400">Insira seu link M3U ou dados do servidor</p>
          </div>
        </div>

        {lastSyncStr && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-[11px] text-neutral-400 flex items-center justify-between">
            <span>Última sincronização:</span>
            <span className="font-semibold text-neutral-200">{lastSyncStr}</span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSync} className="space-y-3.5">
          {/* Campo Rápido: Colar Link M3U Completo */}
          <div className="p-3 rounded-2xl bg-violet-950/20 border border-violet-500/20 space-y-1.5">
            <label className="text-[11px] font-bold text-violet-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Preenchimento Rápido (Cole o link M3U completo)
            </label>
            <div className="relative">
              <LinkIcon className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cole o link http://.../get.php?username=... aqui"
                value={m3uUrlInput}
                onChange={(e) => handleParseM3U(e.target.value)}
                disabled={syncing}
                className="w-full bg-[#0b0c10] border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-violet-500 placeholder:text-neutral-600"
              />
            </div>
            <p className="text-[10px] text-neutral-400">
              Detecta e preenche automaticamente o Servidor, Usuário e Senha.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1">
              URL do Servidor IPTV (Host e Porta)
            </label>
            <input
              type="text"
              placeholder="http://dfpump.top:80"
              value={host}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes('get.php') || val.includes('username=')) {
                  handleParseM3U(val);
                } else {
                  setHost(val);
                }
              }}
              required
              disabled={syncing}
              className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Usuário IPTV
              </label>
              <input
                type="text"
                placeholder="Seu usuário"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={syncing}
                className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Senha IPTV
              </label>
              <input
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={syncing}
                className="w-full bg-[#0b0c10] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          {syncing && (
            <div className="py-2 flex items-center gap-2 text-xs text-violet-400 font-medium">
              <RotateCw className="w-4 h-4 animate-spin" />
              <span>{progressMsg}</span>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={syncing}
              className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 transition"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={syncing}
              className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-xs font-semibold text-white shadow-lg shadow-violet-600/30 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {syncing ? (
                'Sincronizando...'
              ) : (
                <>
                  <RotateCw className="w-3.5 h-3.5" />
                  Sincronizar Agora
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
