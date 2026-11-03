'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search,
  Tv,
  Film,
  Video,
  List,
  Heart,
  Users,
  LogOut,
  Play,
  RotateCw,
  Sparkles,
  Menu,
  X,
  Settings,
  ChevronDown,
  User,
} from 'lucide-react';
import { searchStreams, ensureSearchDataLoaded } from '@/lib/search-index';
import { BaseStreamItem, SessionUser } from '@/lib/types';
import { getInfoUrl, getWatchUrl } from '@/lib/routes';
import { usePlayer } from '@/context/PlayerContext';
import { clearUserLocalData } from '@/lib/db-local';
import { resetFavoritesCache } from '@/hooks/useFavorites';
import { resetWatchedCache } from '@/hooks/useWatched';
import { resetContinueCache } from '@/hooks/useContinueWatching';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { play } = usePlayer();

  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BaseStreamItem[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchIdRef = useRef(0);

  // Busca dados do usuário logado
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});

    // Pré-aquece o cache de busca em background após a inicialização da aplicação
    const preheatTimer = setTimeout(() => {
      ensureSearchDataLoaded();
    }, 1200);

    return () => {
      clearTimeout(preheatTimer);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Atalho de Teclado (Ctrl + K ou /) para focar na busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        const input = document.getElementById('omnibar-input');
        input?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fecha busca ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Trava scroll da tela quando menu mobile estiver aberto
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Fecha menu mobile e dropdown ao trocar de rota
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsProfileDropdownOpen(false);
  }, [pathname]);

  // Fecha menu mobile e dropdown com tecla Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
        setIsProfileDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Fecha dropdown do perfil ao clicar fora
  useEffect(() => {
    const handleClickOutsideProfile = (e: MouseEvent) => {
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(e.target as Node)
      ) {
        setIsProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideProfile);
    return () => document.removeEventListener('mousedown', handleClickOutsideProfile);
  }, []);

  // Execução da busca com debounce inteligente de 180ms e cancelamento de buscas antigas
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setIsSearchOpen(false);
      setIsSearching(false);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      return;
    }

    setIsSearchOpen(true);
    setIsSearching(true);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const currentSearchId = ++searchIdRef.current;

    // Aguarda 180ms após o usuário parar de teclar para rodar a busca instantânea em memória (< 1ms)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchStreams(val, 5);
        if (searchIdRef.current === currentSearchId) {
          setSearchResults(results);
        }
      } catch (e) {
        if (searchIdRef.current === currentSearchId) {
          setSearchResults([]);
        }
      } finally {
        if (searchIdRef.current === currentSearchId) {
          setIsSearching(false);
        }
      }
    }, 180);
  };

  const handleSelectSearchResult = (item: BaseStreamItem) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    router.push(getInfoUrl(item.stream_type, item.stream_id));
  };

  const handleSearchAll = () => {
    if (!searchQuery.trim()) return;
    setIsSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
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

  // Links da barra principal desktop (focada nas categorias de mídias)
  const desktopNavLinks = [
    { href: '/', label: 'Início', icon: Sparkles },
    { href: '/live', label: 'TV ao Vivo', icon: Tv },
    { href: '/movies', label: 'Filmes', icon: Film },
    { href: '/series', label: 'Séries', icon: Video },
    { href: '/catalog', label: 'Catálogo', icon: List },
  ];

  // Links do menu gaveta mobile (navegação completa)
  const mobileNavLinks = [
    { href: '/', label: 'Início', icon: Sparkles },
    { href: '/live', label: 'TV ao Vivo', icon: Tv },
    { href: '/movies', label: 'Filmes', icon: Film },
    { href: '/series', label: 'Séries', icon: Video },
    { href: '/catalog', label: 'Catálogo', icon: List },
    { href: '/favorites', label: 'Favoritos', icon: Heart },
    { href: '/settings', label: 'Configurações', icon: Settings },
  ];

  if (currentUser?.role === 'admin') {
    mobileNavLinks.push({ href: '/admin/users', label: 'Usuários', icon: Users });
  }

  return (
    <header className="sticky top-0 z-40 w-full glass-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Lado Esquerdo: Hamburger Menu Mobile + Logo AGUENATV */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            className="lg:hidden p-2 -ml-1 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 active:scale-95 transition cursor-pointer flex items-center justify-center border border-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-600/30 group-hover:scale-105 transition-transform">
              <Tv className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-200 to-violet-400 bg-clip-text text-transparent">
              AGUENA<span className="text-violet-500">TV</span>
            </span>
          </Link>
        </div>

        {/* Links Principais de Navegação (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1">
          {desktopNavLinks.map((link) => {
            const isActive = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-violet-400' : ''}`} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Omnibar de Busca Central com Fuzzy Search */}
        <div ref={searchRef} className="relative flex-1 max-w-md">
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="omnibar-input"
              type="text"
              placeholder="Buscar canal, filme ou série..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => {
                ensureSearchDataLoaded();
                if (searchQuery.trim()) setIsSearchOpen(true);
              }}
              onMouseEnter={() => {
                ensureSearchDataLoaded();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchAll();
                }
              }}
              className="w-full bg-[#13141b]/90 border border-white/10 hover:border-violet-500/40 focus:border-violet-500 text-xs text-white rounded-xl pl-9 pr-14 py-2 focus:outline-none transition-all placeholder:text-neutral-500"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 bg-white/5 rounded border border-white/10">
              Ctrl K
            </kbd>
          </div>

          {/* Dropdown com as 5 referências mais próximas e botão Pesquisar Todos */}
          {isSearchOpen && searchQuery.trim().length > 0 && (
            <div className="absolute top-full mt-2 w-full bg-[#13141b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in duration-150 backdrop-blur-md">
              <div className="px-3.5 py-2 text-[10px] font-bold text-neutral-400 border-b border-white/5 uppercase tracking-wider flex justify-between items-center">
                <span>5 Referências Mais Próximas</span>
                {isSearching ? (
                  <span className="text-violet-400 animate-pulse">Buscando...</span>
                ) : (
                  <span className="text-violet-400">{searchResults.length} de 5</span>
                )}
              </div>

              {searchResults.length === 0 && !isSearching ? (
                <div className="p-4 text-center text-xs text-neutral-400">
                  Nenhuma referência direta encontrada para &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-white/5">
                  {searchResults.map((item) => {
                    const typeLabel =
                      item.stream_type === 'series'
                        ? 'Série'
                        : item.stream_type === 'movie'
                        ? 'Filme'
                        : 'Ao Vivo';

                    return (
                      <div
                        key={`${item.stream_type}-${item.stream_id}`}
                        onClick={() => handleSelectSearchResult(item)}
                        className="p-2.5 flex items-center gap-3 hover:bg-white/5 cursor-pointer transition group"
                      >
                        <div className="w-10 h-14 rounded-lg bg-neutral-900 overflow-hidden shrink-0 flex items-center justify-center border border-white/5">
                          <ImageWithFallback
                            src={item.stream_icon}
                            alt={item.title || item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            isSmallThumb={true}
                          />
                        </div>
                        <div className="flex-1 truncate">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase bg-violet-600/30 text-violet-300 border border-violet-500/20">
                              {typeLabel}
                            </span>
                            <h4 className="text-xs font-semibold text-neutral-200 truncate group-hover:text-violet-400 transition-colors">
                              {item.title || item.name}
                            </h4>
                          </div>
                          <p className="text-[11px] text-neutral-500 truncate mt-0.5">
                            {item.category_name || 'Geral'}
                          </p>
                        </div>
                        {item.rating && (
                          <span className="text-xs text-amber-400 font-semibold shrink-0">
                            ★ {item.rating}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Botão de Rodapé: Pesquisar Todos */}
              <div className="p-2 border-t border-white/5 bg-[#0f1016]">
                <button
                  onClick={handleSearchAll}
                  className="w-full py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Pesquisar todos</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lado Direito: Dropdown do Usuário no Desktop e Botão de Logout no Mobile */}
        <div className="flex items-center gap-2">
          {/* Dropdown Desktop (Favoritos, Configurações, Usuários, Sair) */}
          <div ref={profileDropdownRef} className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setIsProfileDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2.5 p-1.5 pl-2.5 pr-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500/40 transition cursor-pointer group select-none"
              aria-expanded={isProfileDropdownOpen}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white font-extrabold text-xs shadow-md shadow-violet-600/30 group-hover:scale-105 transition-transform shrink-0">
                {currentUser?.displayName ? (
                  currentUser.displayName.slice(0, 2).toUpperCase()
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>
              <div className="flex flex-col text-left leading-tight">
                <span className="text-xs font-bold text-neutral-200 group-hover:text-white transition-colors truncate max-w-[120px]">
                  {currentUser?.displayName || 'Minha Conta'}
                </span>
                <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
                  {currentUser?.role || 'Usuário'}
                </span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-200 transition-transform duration-200 ${
                  isProfileDropdownOpen ? 'rotate-180 text-violet-400' : ''
                }`}
              />
            </button>

            {/* Menu Dropdown com Itens Solicitados */}
            {isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[#111218]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Header do Perfil */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300 font-bold text-xs uppercase shrink-0">
                    {currentUser?.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : 'US'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate leading-tight">
                      {currentUser?.displayName || 'Usuário'}
                    </p>
                    <p className="text-[11px] text-neutral-400 truncate">
                      @{currentUser?.username || 'conta'}
                    </p>
                  </div>
                </div>

                {/* Itens Principais do Dropdown: Favoritos, Configurações, Usuários */}
                <div className="p-1.5 space-y-0.5">
                  <Link
                    href="/favorites"
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname === '/favorites'
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                        : 'text-neutral-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Heart className="w-4 h-4 text-rose-400 fill-rose-500/20" />
                    <span>Favoritos</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setIsProfileDropdownOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname === '/settings'
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                        : 'text-neutral-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Settings className="w-4 h-4 text-violet-400" />
                    <div className="flex-1 flex items-center justify-between">
                      <span>Configurações</span>
                      <span className="text-[10px] text-neutral-500">M3U / Cache</span>
                    </div>
                  </Link>

                  {currentUser?.role === 'admin' && (
                    <Link
                      href="/admin/users"
                      onClick={() => setIsProfileDropdownOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        pathname === '/admin/users'
                          ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                          : 'text-neutral-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Users className="w-4 h-4 text-indigo-400" />
                      <div className="flex-1 flex items-center justify-between">
                        <span>Usuários</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-600/20 text-violet-300 border border-violet-500/30">
                          Admin
                        </span>
                      </div>
                    </Link>
                  )}
                </div>

                {/* Divisor & Botão Sair */}
                <div className="pt-1 mt-1 border-t border-white/5 p-1.5">
                  <button
                    onClick={() => {
                      setIsProfileDropdownOpen(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Botão de Logout Rápido no Mobile */}
          <button
            onClick={handleLogout}
            className="md:hidden p-2 rounded-xl text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20"
            title="Sair da conta"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Popup Lateral / Drawer Menu para Mobile */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop com Blur */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Gaveta Lateral (Slide from Left) */}
          <div className="fixed inset-y-0 left-0 w-72 sm:w-80 max-w-[85vw] bg-[#0c0d12]/95 border-r border-white/10 backdrop-blur-2xl flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Cabeçalho da Gaveta */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-600/30">
                  <Tv className="w-4 h-4 text-white" />
                </div>
                <span className="font-extrabold text-base tracking-tight text-white">
                  AGUENA<span className="text-violet-500">TV</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fechar menu"
                className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info do Usuário se logado */}
            {currentUser && (
              <div className="px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold text-xs uppercase">
                  {currentUser.displayName ? currentUser.displayName.slice(0, 2) : 'US'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-neutral-200 truncate leading-tight">
                    {currentUser.displayName}
                  </p>
                  <span className="inline-block text-[9px] font-semibold text-violet-400 uppercase tracking-wider">
                    {currentUser.role}
                  </span>
                </div>
              </div>
            )}

            {/* Links de Navegação Originais */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                Navegação
              </div>
              {mobileNavLinks.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-violet-400' : 'text-neutral-400'}`} />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Rodapé da Gaveta com Botão de Logout */}
            <div className="p-3 border-t border-white/10 bg-[#08090d]">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>Sair da conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
