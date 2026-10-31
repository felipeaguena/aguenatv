'use client';
import { useState, useEffect } from 'react';
import { RotateCw, Sparkles, X } from 'lucide-react';
import { localDB, isSyncNeeded, getLastSyncTime } from '@/lib/db-local';
import SyncModal from './SyncModal';

export default function SyncReminder() {
  const [showReminder, setShowReminder] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastSyncText, setLastSyncText] = useState<string>('');

  useEffect(() => {
    // Evita checagem se o usuário já dispensou nesta sessão do navegador
    const isDismissed = typeof window !== 'undefined' ? sessionStorage.getItem('iptv_sync_reminder_dismissed') : null;
    if (isDismissed) return;

    let timer: NodeJS.Timeout;

    async function checkSync() {
      if (!localDB) return;
      try {
        const streamCount = await localDB.streams.count();
        // Só exibe o lembrete se o usuário já tiver dados sincronizados anteriormente
        if (streamCount === 0) return;

        // Verifica se faz mais de 24 horas desde a última sincronização
        const needed = await isSyncNeeded(24);
        if (needed) {
          const lastTs = await getLastSyncTime();
          if (lastTs) {
            const diffHours = Math.floor((Date.now() - lastTs) / (1000 * 60 * 60));
            if (diffHours >= 48) {
              setLastSyncText(`Última sincronização há ${Math.floor(diffHours / 24)} dias`);
            } else {
              setLastSyncText(`Última sincronização há ${diffHours} horas`);
            }
          }

          // Aguarda 4 segundos de uso da página para exibir suavemente sem atrapalhar
          timer = setTimeout(() => {
            setShowReminder(true);
          }, 4000);
        }
      } catch (err) {
        console.warn('Erro ao checar status de sincronização:', err);
      }
    }

    checkSync();
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShowReminder(false);
    sessionStorage.setItem('iptv_sync_reminder_dismissed', 'true');
  };

  const handleOpenSync = () => {
    setShowReminder(false);
    setIsModalOpen(true);
  };

  const handleSyncComplete = () => {
    setIsModalOpen(false);
    sessionStorage.setItem('iptv_sync_reminder_dismissed', 'true');
    // Atualiza a página suavemente para carregar os novos itens no catálogo
    window.location.reload();
  };

  return (
    <>
      {showReminder && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-40 max-w-sm animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="bg-[#12141f]/95 backdrop-blur-xl border border-violet-500/30 hover:border-violet-500/60 transition-all rounded-2xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.7)] text-white">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center shrink-0 text-violet-400 mt-0.5 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
                    Novos Lançamentos
                  </h4>
                  <button
                    onClick={handleDismiss}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1 -mt-1 rounded-lg"
                    title="Dispensar por agora"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {lastSyncText ? `${lastSyncText}. ` : ''}
                  Deseja atualizar sua lista para buscar novos filmes e capítulos adicionados no IPTV?
                </p>

                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleOpenSync}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-medium shadow-md shadow-violet-600/25 transition-all cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Atualizar Agora</span>
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                  >
                    Depois
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <SyncModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSyncComplete={handleSyncComplete}
        />
      )}
    </>
  );
}
