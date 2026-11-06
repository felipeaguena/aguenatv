'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff, HardDrive, ArrowRight, X, AlertCircle } from 'lucide-react';
import { getOfflineDownloadsList, getCachedManifestSync, PROGRESS_EVENT } from '@/lib/download-manager';

export function OfflineBanner() {
  const router = useRouter();
  const [isOffline, setIsOffline] = useState(false);
  const [offlineCount, setOfflineCount] = useState(() => {
    if (typeof window !== 'undefined') {
      return getCachedManifestSync().length;
    }
    return 0;
  });
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const updateCount = async () => {
      try {
        const list = await getOfflineDownloadsList();
        setOfflineCount(list.length);
      } catch {
        setOfflineCount(getCachedManifestSync().length);
      }
    };

    const updateOnlineStatus = async () => {
      const offline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
      setIsOffline(offline);
      if (offline) {
        await updateCount();
      }
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener(PROGRESS_EVENT, updateCount);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener(PROGRESS_EVENT, updateCount);
    };
  }, []);

  if (!isOffline) return null;

  const handleOpenConfirm = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmNavigate = () => {
    setShowConfirmModal(false);
    router.push('/offline');
  };

  return (
    <>
      <aside
        aria-label="Aviso de Modo Offline"
        className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2.5 transition-all text-xs z-50 sticky top-0 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <span className="truncate">
              <strong>Você está sem conexão:</strong> Sua navegação atual continua ativa.{' '}
              {offlineCount > 0 && (
                <span className="hidden sm:inline">({offlineCount} títulos disponíveis na memória)</span>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={handleOpenConfirm}
            className="px-3 py-1 rounded-xl bg-amber-500/25 hover:bg-amber-500/35 border border-amber-500/40 text-amber-100 font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Acessar Conteúdo Offline</span>
            <ArrowRight className="w-3 h-3 ml-0.5" />
          </button>
        </div>
      </aside>

      {/* Modal de Confirmação para evitar sair da página ativa involuntariamente */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#13141b] rounded-2xl border border-white/10 shadow-2xl p-5 space-y-4 relative">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Ir para o Modo Offline?</h3>
                <p className="text-xs text-neutral-400">Você sairá da tela atual para abrir a lista de títulos salvos.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
              Se você estiver assistindo a um vídeo ou navegando, pode continuar normalmente na página atual sem alternar.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Continuar nesta página
              </button>
              <button
                type="button"
                onClick={handleConfirmNavigate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Ir para Conteúdo Offline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
