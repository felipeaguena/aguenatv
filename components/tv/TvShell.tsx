'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sparkles,
  Search,
  Tv,
  Film,
  Video,
  Heart,
  Settings,
  Smartphone,
  LogOut,
  Menu,
  X,
  WifiOff,
  ChevronRight,
  User,
  Play,
  Info,
} from 'lucide-react';
import { searchStreams, ensureSearchDataLoaded } from '@/lib/search-index';
import { BaseStreamItem, SessionUser } from '@/lib/types';
import { getTvInfoUrl, getTvWatchUrl, getTvSearchUrl } from '@/lib/tv-routes';
import { clearUserLocalData } from '@/lib/db-local';
import { resetFavoritesCache } from '@/hooks/useFavorites';
import { resetWatchedCache } from '@/hooks/useWatched';
import { resetContinueCache } from '@/hooks/useContinueWatching';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface TvShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: '/tv', label: 'Início', icon: Sparkles, matchExact: true },
  { href: '/tv/search', label: 'Buscar', icon: Search, matchExact: false },
  { href: '/tv/live', label: 'TV Ao Vivo', icon: Tv, matchExact: false },
  { href: '/tv/movies', label: 'Filmes', icon: Film, matchExact: false },
  { href: '/tv/series', label: 'Séries', icon: Video, matchExact: false },
  { href: '/tv/favorites', label: 'Favoritos', icon: Heart, matchExact: false },
  { href: '/tv/settings', label: 'Configurações', icon: Settings, matchExact: false },
];

function getSectionTitle(pathname: string): string {
  if (pathname === '/tv') return 'Início';
  if (pathname.startsWith('/tv/live')) return 'TV Ao Vivo';
  if (pathname.startsWith('/tv/movies')) return 'Filmes';
  if (pathname.startsWith('/tv/series')) return 'Séries';
  if (pathname.startsWith('/tv/favorites')) return 'Favoritos';
  if (pathname.startsWith('/tv/search')) return 'Buscar';
  if (pathname.startsWith('/tv/settings')) return 'Configurações';
  if (pathname.startsWith('/tv/info')) return 'Detalhes';
  return 'AGUENATV';
}

export default function TvShell({ children }: TvShellProps) {
  const pathname = usePathname() || '/tv';
  const router = useRouter();
  const isWatchRoute = pathname.startsWith('/tv/watch');

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [tabletMenuOpen, setTabletMenuOpen] = useState(false);
  const [time, setTime] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);

  // Busca Global Persistente na Topbar
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BaseStreamItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  // Relógio + Status de Rede + Usuário
  useEffect(() => {
    const updateClock = () => {
      setTime(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 30_000);

    const updateOnline = () => {
      setIsOffline(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    };
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});

    return () => {
      clearInterval(clockInterval);
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Fecha menus/dropdown ao clicar em navegação
  const closeMenus = () => {
    setTabletMenuOpen(false);
    setIsSearchOpen(false);
  };

  // Fecha dropdown de busca ao clicar fora
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Intercepta tecla Voltar da TV para fechar busca/gaveta antes de navegar
  useEffect(() => {
    const handleTvBack = (e: Event) => {
      if (isSearchOpen) {
        e.preventDefault();
        setIsSearchOpen(false);
        return;
      }
      if (tabletMenuOpen) {
        e.preventDefault();
        setTabletMenuOpen(false);
      }
    };
    window.addEventListener('aguenatv:tv-back', handleTvBack);
    return () => window.removeEventListener('aguenatv:tv-back', handleTvBack);
  }, [isSearchOpen, tabletMenuOpen]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSearchResults([]);
      setIsSearchOpen(false);
      setIsSearching(false);
      return;
    }

    setIsSearchOpen(true);
    setIsSearching(true);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const seq = ++searchSeqRef.current;
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchStreams(value, 8);
        if (searchSeqRef.current === seq) {
          setSearchResults(results);
        }
      } catch {
        if (searchSeqRef.current === seq) {
          setSearchResults([]);
        }
      } finally {
        if (searchSeqRef.current === seq) {
          setIsSearching(false);
        }
      }
    }, 180);
  };

  const handleSelectSearchItem = (item: BaseStreamItem) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    if (item.stream_type === 'live') {
      router.push(getTvWatchUrl(item.stream_type, item.stream_id));
    } else {
      router.push(getTvInfoUrl(item.stream_type, item.stream_id));
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) {
      router.push('/tv/search');
      return;
    }
    setIsSearchOpen(false);
    router.push(getTvSearchUrl(searchQuery));
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

  if (isWatchRoute) {
    return <main className="flex-1 min-h-screen bg-black">{children}</main>;
  }

  const sectionTitle = getSectionTitle(pathname);

  return (
    <div className="flex min-h-screen w-full bg-[#08090d] text-white relative">
      {/* Backdrop no Tablet quando menu lateral aberto */}
      {tabletMenuOpen && (
        <div
          className="fixed inset-0 z-[998] bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setTabletMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SIDEBAR ESQUERDA RETRÁTIL ESTILO NETFLIX (Rail 76px -> 232px) */}
      <aside
        data-tv-zone="sidebar"
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
        onFocusCapture={() => setSidebarExpanded(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setSidebarExpanded(false);
          }
        }}
        className={`fixed top-0 left-0 bottom-0 z-[999] flex flex-col bg-[#0a0b11]/95 backdrop-blur-2xl border-r border-white/10 transition-all duration-200 ease-out shadow-2xl ${
          tabletMenuOpen ? 'translate-x-0 w-[232px]' : '-translate-x-full md:translate-x-0'
        } ${sidebarExpanded ? 'md:w-[232px]' : 'md:w-[76px]'}`}
      >
        {/* Logo da Sidebar */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10 shrink-0 overflow-hidden">
          <Link
            href="/tv"
            onClick={closeMenus}
            data-tv-focusable="true"
            data-tv-focus="nav"
            className="flex items-center gap-3 min-w-0 focus:outline-none rounded-xl p-1"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-600/30 shrink-0">
              <Tv className="w-5 h-5 text-white" />
            </div>
            <div
              className={`flex flex-col leading-none transition-opacity duration-150 ${
                sidebarExpanded || tabletMenuOpen ? 'opacity-100' : 'md:opacity-0 md:pointer-events-none'
              }`}
            >
              <span className="font-black text-sm tracking-tight text-white whitespace-nowrap">
                AGUENA<span className="text-violet-400">TV</span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-violet-300/80 mt-0.5 whitespace-nowrap">
                TV & Tablet
              </span>
            </div>
          </Link>

          {tabletMenuOpen && (
            <button
              type="button"
              onClick={() => setTabletMenuOpen(false)}
              className="md:hidden p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Links Principais */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto tv-scroll-col">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.matchExact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenus}
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="nav"
                data-tv-active={isActive ? 'true' : undefined}
                title={item.label}
                className={`group flex items-center gap-3.5 px-3 py-3 rounded-2xl text-sm font-bold transition-all focus:outline-none overflow-hidden ${
                  isActive
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/35'
                    : 'text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-white' : 'text-neutral-400 group-hover:text-violet-300'
                  }`}
                />
                <span
                  className={`whitespace-nowrap transition-opacity duration-150 ${
                    sidebarExpanded || tabletMenuOpen ? 'opacity-100' : 'md:opacity-0 md:w-0'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar: Usuário, Modo Celular, Sair */}
        <div className="p-3 border-t border-white/10 space-y-1.5 shrink-0">
          {currentUser && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/5 overflow-hidden">
              <div className="w-7 h-7 rounded-xl bg-violet-600/30 border border-violet-500/40 flex items-center justify-center text-[11px] font-black text-violet-200 shrink-0 uppercase">
                {currentUser.displayName ? currentUser.displayName.slice(0, 2) : <User className="w-3.5 h-3.5" />}
              </div>
              <div
                className={`min-w-0 transition-opacity duration-150 ${
                  sidebarExpanded || tabletMenuOpen ? 'opacity-100' : 'md:opacity-0 md:w-0'
                }`}
              >
                <p className="text-xs font-bold text-white truncate">{currentUser.displayName}</p>
                <p className="text-[10px] text-violet-400 uppercase font-semibold">{currentUser.role}</p>
              </div>
            </div>
          )}

          <Link
            href="/"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="nav"
            title="Alternar para Modo Celular"
            className="flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/10 transition-all focus:outline-none overflow-hidden"
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span
              className={`whitespace-nowrap transition-opacity duration-150 ${
                sidebarExpanded || tabletMenuOpen ? 'opacity-100' : 'md:opacity-0 md:w-0'
              }`}
            >
              Modo Celular
            </span>
          </Link>

          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="nav"
            onClick={handleLogout}
            title="Sair da conta"
            className="w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/15 transition-all cursor-pointer focus:outline-none overflow-hidden"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span
              className={`whitespace-nowrap transition-opacity duration-150 ${
                sidebarExpanded || tabletMenuOpen ? 'opacity-100' : 'md:opacity-0 md:w-0'
              }`}
            >
              Sair da conta
            </span>
          </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL (deslocada pelo rail de 76px em telas >= md) */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-[76px]">
        {/* TOPBAR PERSISTENTE COM INPUT DE BUSCA GLOBAL EM TODAS AS PÁGINAS */}
        <header
          data-tv-zone="topbar"
          className="sticky top-0 z-[900] h-16 px-4 sm:px-6 lg:px-8 bg-[#08090d]/90 backdrop-blur-2xl border-b border-white/10 flex items-center justify-between gap-3 sm:gap-4"
        >
          {/* Esquerda: Botão Menu Tablet + Título da Seção */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setTabletMenuOpen(true)}
              data-tv-focusable="true"
              data-tv-focus="button"
              aria-label="Abrir navegação"
              className="md:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black tracking-tight text-white">
                {sectionTitle}
              </span>
              <span className="hidden lg:inline-flex px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-violet-600/20 text-violet-300 border border-violet-500/30">
                10-Foot UI
              </span>
            </div>
          </div>

          {/* Centro: Input de Busca Global Presente em Todas as Páginas */}
          <div ref={searchWrapperRef} className="relative flex-1 max-w-xl">
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
              <input
                id="tv-global-search-input"
                type="text"
                data-tv-focusable="true"
                data-tv-focus="input"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  ensureSearchDataLoaded();
                  if (searchQuery.trim()) setIsSearchOpen(true);
                }}
                onMouseEnter={() => {
                  ensureSearchDataLoaded();
                }}
                placeholder="Buscar filmes, séries ou canais (tecla /)..."
                className="w-full bg-[#12131c] border border-white/15 hover:border-violet-500/50 focus:border-violet-500 rounded-2xl pl-10 pr-20 py-2.5 text-xs sm:text-sm text-white placeholder:text-neutral-500 transition-all"
              />
              {searchQuery ? (
                <button
                  type="button"
                  data-tv-focusable="true"
                  data-tv-focus="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setIsSearchOpen(false);
                  }}
                  aria-label="Limpar busca"
                  className="absolute right-10 p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
              <button
                type="submit"
                data-tv-focusable="true"
                data-tv-focus="button"
                aria-label="Pesquisar tudo"
                className="absolute right-1.5 px-2.5 py-1.5 rounded-xl bg-violet-600/25 hover:bg-violet-600 text-violet-200 hover:text-white text-[11px] font-bold transition cursor-pointer"
              >
                Ir
              </button>
            </form>

            {/* Dropdown Flutuante Instantâneo com Resultados Navegáveis via D-Pad */}
            {isSearchOpen && searchQuery.trim().length > 0 && (
              <div className="fixed sm:absolute inset-x-3 sm:inset-x-0 top-16 sm:top-full mt-2 bg-[#11121a]/98 border border-white/15 rounded-2xl shadow-2xl overflow-hidden z-[950] backdrop-blur-2xl">
                <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                  <span>Resultados Rápidos</span>
                  {isSearching ? (
                    <span className="text-violet-400 animate-pulse">Pesquisando...</span>
                  ) : (
                    <span className="text-violet-400">{searchResults.length} encontrados</span>
                  )}
                </div>

                {searchResults.length === 0 && !isSearching ? (
                  <div className="p-5 text-center text-xs text-neutral-400">
                    Nenhum resultado instantâneo para &quot;{searchQuery}&quot;. Pressione Enter para busca completa.
                  </div>
                ) : (
                  <div className="max-h-[55vh] overflow-y-auto divide-y divide-white/5 tv-scroll-col">
                    {searchResults.map((item) => {
                      const isLive = item.stream_type === 'live';
                      const typeLabel =
                        item.stream_type === 'series'
                          ? 'Série'
                          : item.stream_type === 'movie'
                          ? 'Filme'
                          : 'Ao Vivo';

                      return (
                        <button
                          key={`${item.stream_type}_${item.stream_id}`}
                          type="button"
                          tabIndex={0}
                          data-tv-focusable="true"
                          data-tv-focus="pill"
                          onClick={() => handleSelectSearchItem(item)}
                          className="w-full p-3 flex items-center gap-3.5 text-left hover:bg-white/10 focus:bg-violet-600/20 transition cursor-pointer focus:outline-none"
                        >
                          <div className="w-11 h-14 rounded-xl bg-black overflow-hidden border border-white/10 shrink-0 flex items-center justify-center">
                            <ImageWithFallback
                              src={item.stream_icon}
                              alt={item.title || item.name}
                              className={`w-full h-full ${isLive ? 'object-contain p-1' : 'object-cover'}`}
                              isSmallThumb={true}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                                  isLive
                                    ? 'bg-rose-600/25 text-rose-300 border-rose-500/40'
                                    : item.stream_type === 'series'
                                    ? 'bg-indigo-600/25 text-indigo-300 border-indigo-500/40'
                                    : 'bg-emerald-600/25 text-emerald-300 border-emerald-500/40'
                                }`}
                              >
                                {typeLabel}
                              </span>
                              <span className="text-sm font-bold text-white truncate">
                                {item.title || item.name}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-400 truncate mt-0.5">
                              {item.category_name || 'Catálogo'}
                            </p>
                          </div>
                          <div className="shrink-0 text-violet-400 flex items-center gap-1 text-xs font-bold">
                            {isLive ? <Play className="w-4 h-4 fill-violet-400" /> : <Info className="w-4 h-4" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="p-2.5 bg-[#0c0d14] border-t border-white/10">
                  <button
                    type="button"
                    tabIndex={0}
                    data-tv-focusable="true"
                    data-tv-focus="button"
                    onClick={() => handleSearchSubmit()}
                    className="w-full py-2.5 px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Search className="w-4 h-4" />
                    <span>Ver todos os resultados para &quot;{searchQuery}&quot;</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Direita: Status de Rede e Relógio */}
          <div className="flex items-center gap-2.5 shrink-0">
            {isOffline && (
              <Link
                href="/offline"
                data-tv-focusable="true"
                data-tv-focus="pill"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs font-bold"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline</span>
              </Link>
            )}

            {time && (
              <div className="hidden sm:flex items-center font-mono text-sm font-bold text-neutral-300 bg-white/5 px-3.5 py-1.5 rounded-xl border border-white/10">
                {time}
              </div>
            )}
          </div>
        </header>

        {/* CONTEÚDO DA ROTA ATUAL */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
