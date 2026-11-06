'use client';
import { useState, useEffect } from 'react';
import { Download, Sparkles, X, ExternalLink, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppVersionInfo } from '@/app/api/version/route';
import { BackgroundDownload } from '@/lib/download-manager';

const FALLBACK_VERSION = '0.2.6';

interface UpdateAlertModalProps {
  manualCheck?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

function parseSemver(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
}

function isVersionLower(current: string, target: string): boolean {
  const c = parseSemver(current);
  const t = parseSemver(target);
  const maxLen = Math.max(c.length, t.length);
  for (let i = 0; i < maxLen; i++) {
    const cVal = c[i] || 0;
    const tVal = t[i] || 0;
    if (cVal < tVal) return true;
    if (cVal > tVal) return false;
  }
  return false;
}

export default function UpdateAlertModal({
  manualCheck = false,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: UpdateAlertModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string>(FALLBACK_VERSION);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [checking, setChecking] = useState(false);

  // Estados de download nativo do APK com barra de progresso
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('');

  // Detecta a versão instalada no APK via Capacitor nativo
  useEffect(() => {
    async function detectInstalledVersion() {
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          const info = await App.getInfo();
          if (info?.version) {
            setInstalledVersion(info.version);
            return;
          }
        } catch {}
      }
      setInstalledVersion(FALLBACK_VERSION);
    }
    detectInstalledVersion();
  }, []);

  const checkVersion = async (isManual = false) => {
    setChecking(true);
    try {
      let currentVer = installedVersion;
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          const info = await App.getInfo();
          if (info?.version) currentVer = info.version;
        } catch {}
      }

      const res = await fetch('/api/version');
      if (res.ok) {
        const data: AppVersionInfo = await res.json();
        setVersionInfo(data);

        // O popup SÓ aparece se a versão instalada for estritamente menor que a do GitHub
        const isStrictlyLower = isVersionLower(currentVer, data.latestVersion);
        setHasUpdate(isStrictlyLower);

        if (isManual) {
          setIsOpen(true);
        } else if (isStrictlyLower) {
          const dismissed = localStorage.getItem(`dismissed_update_${data.latestVersion}`);
          if (!dismissed) {
            setIsOpen(true);
          }
        }
      }
    } catch {
      if (isManual) alert('Não foi possível verificar atualizações no momento.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkVersion(manualCheck);
  }, [manualCheck]);

  const cleanLatest = versionInfo?.latestVersion?.replace(/^v/i, '') || '0.2.5';
  const directApkUrl = `https://github.com/felipeaguena/aguenatv/releases/download/v${cleanLatest}/AGUENATV-release.apk`;
  const releasesPageUrl = `https://github.com/felipeaguena/aguenatv/releases#release-v${cleanLatest}`;

  // Executa a instalação automática com barra de progresso no APK
  const handleInstallUpdate = async () => {
    if (!Capacitor.isNativePlatform()) {
      // No navegador comum, abre o download direto
      window.open(directApkUrl, '_blank');
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      setDownloadStatus('Iniciando download do pacote...');

      const updateDownloadId = 'apk_update_job';

      // Registra listeners de progresso e conclusão
      const progressSub = await BackgroundDownload.addListener('progress', (data) => {
        if (data.id === updateDownloadId) {
          setDownloadProgress(data.percentage);
          setDownloadStatus(`Baixando atualização... ${data.percentage}%`);
        }
      });

      const completeSub = await BackgroundDownload.addListener('complete', async (data) => {
        if (data.id === updateDownloadId) {
          if (data.success && data.path) {
            setDownloadProgress(100);
            setDownloadStatus('Download finalizado! Abrindo instalador...');
            try {
              await BackgroundDownload.installApk({ filePath: data.path });
            } catch (err: any) {
              setDownloadStatus('Erro ao acionar instalador');
              alert('Erro ao disparar instalador: ' + (err?.message || err));
            }
          } else {
            setDownloadStatus('Falha no download');
            alert('Falha ao baixar nova versão: ' + (data.error || 'Erro de conexão'));
            setIsDownloading(false);
          }
          try {
            progressSub.remove();
            completeSub.remove();
          } catch {}
        }
      });

      await BackgroundDownload.startDownload({
        id: updateDownloadId,
        url: directApkUrl,
        title: `Atualização AGUENATV v${cleanLatest}`,
        fileName: `AGUENATV-v${cleanLatest}.apk`,
      });
    } catch (err: any) {
      console.error('Erro ao baixar atualização:', err);
      alert('Não foi possível iniciar o download da atualização: ' + (err?.message || err));
      setIsDownloading(false);
    }
  };

  // Abre a página de Releases no navegador padrão do aparelho (fora do APK)
  const handleOpenGitHub = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await BackgroundDownload.openExternalUrl({ url: releasesPageUrl });
        return;
      } catch (e) {
        console.warn('Erro ao abrir navegador externo via plugin:', e);
      }
    }
    window.open(releasesPageUrl, '_blank');
  };

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
            {hasUpdate ? <Sparkles className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {hasUpdate ? 'Nova Versão Disponível!' : 'Seu AGUENATV está Atualizado'}
            </h3>
            <p className="text-xs text-neutral-400">
              Versão instalada: <strong className="text-white font-mono">v{installedVersion}</strong>
              {hasUpdate && versionInfo && (
                <span> &rarr; Disponível: <strong className="text-emerald-400 font-mono">v{versionInfo.latestVersion}</strong></span>
              )}
            </p>
          </div>
        </div>

        {hasUpdate ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-xs text-neutral-300">
              <span className="font-bold text-violet-300 block mb-1">Novidades da versão v{cleanLatest}:</span>
              <ul className="space-y-1 list-disc list-inside text-[11px] text-neutral-400 max-h-36 overflow-y-auto pr-1">
                {versionInfo?.changelog?.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">{item}</li>
                )) || <li>Melhorias gerais e correções de estabilidade.</li>}
              </ul>
            </div>

            {/* Barra de Progresso quando estiver baixando */}
            {isDownloading && (
              <div className="p-3.5 rounded-2xl bg-[#181924] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-300 flex items-center gap-1.5 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    {downloadStatus}
                  </span>
                  <span className="font-mono font-bold text-emerald-400">{downloadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200"
                    style={{ width: `${Math.max(4, downloadProgress)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {/* Botão 1: Instalar Atualização Automaticamente com Progresso */}
              <button
                type="button"
                disabled={isDownloading}
                onClick={handleInstallUpdate}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Atualizando AGUENATV ({downloadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Instalar Atualização (v{cleanLatest})</span>
                  </>
                )}
              </button>

              {/* Botão 2: Ver a Release no GitHub (Abre o navegador padrão do aparelho) */}
              <button
                type="button"
                onClick={handleOpenGitHub}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-200 hover:text-white font-semibold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
                <span>Ver Release no GitHub (Navegador)</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="w-full py-2 rounded-xl text-neutral-500 hover:text-neutral-300 text-xs font-medium transition cursor-pointer"
              >
                Lembrar Mais Tarde
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Você já está utilizando a versão mais recente do AGUENATV (v{installedVersion}) com todas as correções instaladas.</span>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-bold transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
