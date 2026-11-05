'use client';
import { useState, useEffect } from 'react';
import { Download, Sparkles, X, ExternalLink, RefreshCw, CheckCircle2 } from 'lucide-react';
import { AppVersionInfo } from '@/app/api/version/route';

const CURRENT_VERSION = '0.2.0';

interface UpdateAlertModalProps {
  manualCheck?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function UpdateAlertModal({
  manualCheck = false,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: UpdateAlertModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkVersion = async (isManual = false) => {
    setChecking(true);
    try {
      const res = await fetch('/api/version');
      if (res.ok) {
        const data: AppVersionInfo = await res.json();
        setVersionInfo(data);

        // Compara versões semânticas
        const isNewer = data.latestVersion !== CURRENT_VERSION;
        setHasUpdate(isNewer);

        if (isManual) {
          setIsOpen(true);
        } else if (isNewer) {
          const dismissed = localStorage.getItem(`dismissed_update_${data.latestVersion}`);
          if (!dismissed) {
            setIsOpen(true);
          }
        }
      }
    } catch (err) {
      if (isManual) alert('Não foi possível verificar atualizações no momento.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkVersion(manualCheck);
  }, [manualCheck]);

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setIsOpen(false);
    }
    if (versionInfo?.latestVersion) {
      localStorage.setItem(`dismissed_update_${versionInfo.latestVersion}`, 'true');
    }
  };

  const modalVisible = controlledIsOpen !== undefined ? controlledIsOpen : isOpen;
  if (!modalVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#13141b] rounded-3xl border border-white/10 shadow-2xl p-6 relative overflow-hidden">
        {/* Glow decorativo */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-600/15 rounded-full blur-[80px] pointer-events-none" />

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-600/40 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {hasUpdate ? 'Nova Versão Disponível!' : 'Seu AGUENATV está Atualizado'}
            </h3>
            <p className="text-xs text-neutral-400">
              Versão atual: <strong className="text-white font-mono">v{CURRENT_VERSION}</strong>
              {hasUpdate && versionInfo && (
                <span> &rarr; Nova: <strong className="text-emerald-400 font-mono">v{versionInfo.latestVersion}</strong></span>
              )}
            </p>
          </div>
        </div>

        {hasUpdate ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-xs text-neutral-300">
              <span className="font-bold text-violet-300 block mb-1">Novidades desta versão:</span>
              <ul className="space-y-1 list-disc list-inside text-[11px] text-neutral-400">
                {versionInfo?.changelog?.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">{item}</li>
                )) || <li>Melhorias gerais e correções de estabilidade.</li>}
              </ul>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <a
                href={versionInfo?.apkDownloadUrl || 'https://github.com/felipeaguena/aguenatv/actions'}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-violet-600/30 transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Baixar Novo APK no GitHub</span>
                <ExternalLink className="w-3 h-3 text-violet-200" />
              </a>

              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-xs font-semibold transition"
              >
                Lembrar Mais Tarde
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Você já está utilizando a versão mais recente do AGUENATV com todos os recursos nativos instalados.</span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-bold transition"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
