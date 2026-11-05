'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { WifiOff, HardDrive, ArrowRight } from 'lucide-react';
import { getOfflineDownloadsList } from '@/lib/download-manager';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);

  useEffect(() => {
    const updateOnlineStatus = async () => {
      const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
      setIsOffline(offline);
      if (offline) {
        try {
          const list = await getOfflineDownloadsList();
          setOfflineCount(list.length);
        } catch {}
      }
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <aside
      aria-label="Aviso de Modo Offline e Avião"
      className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2.5 transition-all text-xs z-50 sticky top-0 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span className="truncate">
            <strong>Modo Offline / Avião Ativo:</strong> Navegando pelos dados salvos no aparelho.{' '}
            {offlineCount > 0 && (
              <span className="hidden sm:inline">({offlineCount} vídeos disponíveis na memória)</span>
            )}
          </span>
        </div>

        <Link
          href="/offline"
          className="px-3 py-1 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-500/40 text-amber-100 font-bold transition flex items-center gap-1 shrink-0"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Ver Baixados</span>
          <ArrowRight className="w-3 h-3 ml-0.5" />
        </Link>
      </div>
    </aside>
  );
}
