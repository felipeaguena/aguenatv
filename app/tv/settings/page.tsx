'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  RotateCw,
  Database,
  Tv,
  Film,
  Video,
  CheckCircle2,
  Smartphone,
  LogOut,
  FastForward,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  localDB,
  getSavedIPTVConfig,
  getLastSyncTime,
  clearUserLocalData,
} from '@/lib/db-local';
import { resetFavoritesCache } from '@/hooks/useFavorites';
import { resetWatchedCache } from '@/hooks/useWatched';
import { resetContinueCache } from '@/hooks/useContinueWatching';
import SyncModal from '@/components/ui/SyncModal';

export default function TvSettingsPage() {
  const router = useRouter();
  const [stats, setStats] = useState({ live: 0, movie: 0, series: 0, total: 0 });
  const [lastSync, setLastSync] = useState<string>('Nunca sincronizado');
  const [serverHost, setServerHost] = useState<string>('Não configurado');
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const [autoSkipIntro, setAutoSkipIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('iptv_autoskip_intro') === 'true';
    }
    return false;
  });
  const [autoSkipOutro, setAutoSkipOutro] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('iptv_autoskip_outro') === 'true';
    }
    return false;
  });

  const loadStats = async () => {
    if (!localDB) return;
    try {
      const [liveCount, movieCount, seriesCount, cfg, ts] = await Promise.all([
        localDB.streams.where('stream_type').equals('live').count(),
        localDB.streams.where('stream_type').equals('movie').count(),
        localDB.streams.where('stream_type').equals('series').count(),
        getSavedIPTVConfig(),
        getLastSyncTime(),
      ]);
      setStats({
        live: liveCount,
        movie: movieCount,
        series: seriesCount,
        total: liveCount + movieCount + seriesCount,
      });
      if (cfg?.server_url) {
        setServerHost(cfg.server_url);
      }
      if (ts) {
        setLastSync(new Date(ts).toLocaleString('pt-BR'));
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas TV:', err);
    }
  };

  useEffect(() => {
    let active = true;
    async function init() {
      if (!localDB) return;
      try {
        const [liveCount, movieCount, seriesCount, cfg, ts] = await Promise.all([
          localDB.streams.where('stream_type').equals('live').count(),
          localDB.streams.where('stream_type').equals('movie').count(),
          localDB.streams.where('stream_type').equals('series').count(),
          getSavedIPTVConfig(),
          getLastSyncTime(),
        ]);
        if (!active) return;
        setStats({
          live: liveCount,
          movie: movieCount,
          series: seriesCount,
          total: liveCount + movieCount + seriesCount,
        });
        if (cfg?.server_url) setServerHost(cfg.server_url);
        if (ts) setLastSync(new Date(ts).toLocaleString('pt-BR'));
      } catch (err) {
        console.error('Erro ao carregar estatísticas TV:', err);
      }
    }
    init();
    return () => {
      active = false;
    };
  }, []);

  const toggleIntro = () => {
    const next = !autoSkipIntro;
    setAutoSkipIntro(next);
    try {
      localStorage.setItem('iptv_autoskip_intro', String(next));
    } catch {}
  };

  const toggleOutro = () => {
    const next = !autoSkipOutro;
    setAutoSkipOutro(next);
    try {
      localStorage.setItem('iptv_autoskip_outro', String(next));
    } catch {}
  };

  const handleClearCache = async () => {
    if (!localDB) return;
    if (!confirm('Deseja limpar os dados em cache do dispositivo e sincronizar novamente?')) return;
    await localDB.streams.clear();
    await localDB.categories.clear();
    await loadStats();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    resetFavoritesCache();
    resetWatchedCache();
    resetContinueCache();
    await clearUserLocalData();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="p-6 sm:p-8 max-w-5xl space-y-8" data-tv-zone="content">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">Configurações TV & Tablet</h1>
            <p className="text-xs text-neutral-400">
              Sincronização da lista IPTV, preferências de reprodução e conta
            </p>
          </div>
        </div>

        <button
          type="button"
          tabIndex={0}
          data-tv-focusable="true"
          data-tv-focus="button"
          data-tv-autofocus="true"
          onClick={() => setIsSyncOpen(true)}
          className="px-5 py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold shadow-xl shadow-violet-600/35 flex items-center gap-2 cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
          <span>Sincronizar Lista IPTV</span>
        </button>
      </div>

      {/* Estatísticas do Catálogo Local */}
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-neutral-300 flex items-center gap-2">
          <Database className="w-4 h-4 text-violet-400" />
          <span>Catálogo Sincronizado no Dispositivo</span>
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-[#12131c] border border-white/10 space-y-1">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Tv className="w-4 h-4 text-rose-400" />
              <span>Canais Ao Vivo</span>
            </div>
            <p className="text-2xl font-black text-white font-mono">{stats.live}</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#12131c] border border-white/10 space-y-1">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Film className="w-4 h-4 text-indigo-400" />
              <span>Filmes</span>
            </div>
            <p className="text-2xl font-black text-white font-mono">{stats.movie}</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#12131c] border border-white/10 space-y-1">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Video className="w-4 h-4 text-emerald-400" />
              <span>Séries</span>
            </div>
            <p className="text-2xl font-black text-white font-mono">{stats.series}</p>
          </div>

          <div className="p-4 rounded-2xl bg-[#12131c] border border-white/10 space-y-1">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>Total</span>
            </div>
            <p className="text-2xl font-black text-violet-300 font-mono">{stats.total}</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#101119] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-300">
          <span>
            Servidor ativo: <strong className="text-white font-mono">{serverHost}</strong>
          </span>
          <span className="text-neutral-400">
            Última atualização: <strong className="text-neutral-200">{lastSync}</strong>
          </span>
        </div>
      </section>

      {/* Preferências do Player TV */}
      <section className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-neutral-300 flex items-center gap-2">
          <FastForward className="w-4 h-4 text-violet-400" />
          <span>Preferências de Reprodução</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="pill"
            onClick={toggleIntro}
            className="p-4 rounded-2xl bg-[#12131c] border border-white/10 hover:border-violet-500/40 flex items-center justify-between gap-4 text-left cursor-pointer"
          >
            <div>
              <p className="text-sm font-bold text-white">Pular Abertura Automaticamente</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Avança automaticamente a abertura de séries e animes
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${
                autoSkipIntro
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/5 text-neutral-400 border border-white/10'
              }`}
            >
              {autoSkipIntro ? 'Ativado' : 'Manual'}
            </span>
          </button>

          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="pill"
            onClick={toggleOutro}
            className="p-4 rounded-2xl bg-[#12131c] border border-white/10 hover:border-violet-500/40 flex items-center justify-between gap-4 text-left cursor-pointer"
          >
            <div>
              <p className="text-sm font-bold text-white">Pular Encerramento Automaticamente</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                Avança automaticamente nos créditos finais
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${
                autoSkipOutro
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/5 text-neutral-400 border border-white/10'
              }`}
            >
              {autoSkipOutro ? 'Ativado' : 'Manual'}
            </span>
          </button>
        </div>
      </section>

      {/* Ações de Sistema e Conta */}
      <section className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
        <Link
          href="/settings"
          tabIndex={0}
          data-tv-focusable="true"
          data-tv-focus="button"
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-violet-400" />
          <span>Gerenciar Múltiplas Playlists</span>
        </Link>

        <Link
          href="/"
          tabIndex={0}
          data-tv-focusable="true"
          data-tv-focus="button"
          className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-2"
        >
          <Smartphone className="w-4 h-4 text-neutral-300" />
          <span>Alternar para Modo Celular</span>
        </Link>

        <button
          type="button"
          tabIndex={0}
          data-tv-focusable="true"
          data-tv-focus="button"
          onClick={handleClearCache}
          className="px-4 py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-bold text-amber-200 flex items-center gap-2 cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Limpar Cache Local</span>
        </button>

        <button
          type="button"
          tabIndex={0}
          data-tv-focusable="true"
          data-tv-focus="button"
          onClick={handleLogout}
          className="px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-bold text-rose-200 flex items-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair da Conta</span>
        </button>
      </section>

      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        onSyncComplete={() => {
          setIsSyncOpen(false);
          loadStats();
        }}
      />
    </div>
  );
}
