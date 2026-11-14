'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tv, Film, Video, Heart, Sparkles, Smartphone, Settings } from 'lucide-react';

interface TvNavbarProps {
  activeTab: 'all' | 'live' | 'movies' | 'series' | 'favorites';
  onSelectTab: (tab: 'all' | 'live' | 'movies' | 'series' | 'favorites') => void;
}

export default function TvNavbar({ activeTab, onSelectTab }: TvNavbarProps) {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  const navItems: { id: 'all' | 'live' | 'movies' | 'series' | 'favorites'; label: string; icon: any }[] = [
    { id: 'all', label: 'Início', icon: Sparkles },
    { id: 'live', label: 'TV Ao Vivo', icon: Tv },
    { id: 'movies', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Video },
    { id: 'favorites', label: 'Favoritos', icon: Heart },
  ];

  return (
    <header className="sticky top-0 z-[9999] w-full bg-[#08090d]/95 backdrop-blur-xl border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
      {/* Lado Esquerdo: Logo Studio Aguena com Badge TV */}
      <div className="flex items-center gap-3">
        <img
          src="/studio-aguena-white.png"
          alt="Studio Aguena"
          className="h-8 w-auto object-contain"
        />
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-violet-600/30 text-violet-300 border border-violet-500/40">
          TV & TABLET
        </span>
      </div>

      {/* Centro: Abas de Navegação 10-Foot Widescreen */}
      <nav className="flex items-center gap-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer focus:outline-none ${
                isActive
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/40'
                  : 'bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Lado Direito: Relógio e Botão de Alternar para Versão Celular */}
      <div className="flex items-center gap-4">
        {time && (
          <div className="font-mono text-sm font-bold text-neutral-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            {time}
          </div>
        )}

        <Link
          href="/"
          tabIndex={0}
          data-tv-focusable="true"
          title="Alternar para visualização de Celular"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-400 hover:text-white border border-white/10 transition focus:outline-none"
        >
          <Smartphone className="w-3.5 h-3.5 text-neutral-400" />
          <span>Modo Celular</span>
        </Link>
      </div>
    </header>
  );
}
