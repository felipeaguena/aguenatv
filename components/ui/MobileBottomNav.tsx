'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Tv, Film, Video, Heart } from 'lucide-react';

export default function MobileBottomNav() {
  const pathname = usePathname();

  // Oculta a barra de navegação inferior na página de reprodução em tela cheia
  if (pathname.includes('/watch/')) {
    return null;
  }

  const navItems = [
    { href: '/', label: 'Início', icon: Sparkles },
    { href: '/live', label: 'Ao Vivo', icon: Tv },
    { href: '/movies', label: 'Filmes', icon: Film },
    { href: '/series', label: 'Séries', icon: Video },
    { href: '/favorites', label: 'Favoritos', icon: Heart },
  ];

  return (
    <nav
      aria-label="Navegação inferior mobile"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#0c0d12]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1.5 shadow-2xl safe-area-pb"
    >
      <div className="flex items-center justify-around gap-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'text-violet-400 bg-white/5'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? 'scale-110' : 'scale-100'
                }`}
              />
              <span
                className={`text-[10px] mt-0.5 font-bold tracking-tight truncate max-w-[64px] ${
                  isActive ? 'text-white' : 'text-neutral-400'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
