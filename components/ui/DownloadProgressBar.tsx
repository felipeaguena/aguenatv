'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, ChevronUp, ChevronDown, CheckCircle2, HardDrive } from 'lucide-react';
import { useDownloadProgress } from '@/hooks/useDownloadProgress';
import { formatDownloadSize } from '@/lib/download-manager';

export function DownloadProgressBar() {
  const { activeList, activeCount } = useDownloadProgress();
  const [isExpanded, setIsExpanded] = useState(false);

  if (activeCount === 0) {
    return null;
  }

  // O download principal exibido em destaque (o primeiro da fila)
  const current = activeList[0];
  const { title, progress } = current;
  const percentage = progress.percentage ?? 0;

  return (
    <aside
      aria-label="Progresso de Downloads Ativos"
      className="fixed bottom-20 md:bottom-6 right-3 left-3 md:left-auto md:w-96 z-50 transition-all duration-300 pointer-events-auto"
    >
      <div className="bg-neutral-900/95 backdrop-blur-md border border-violet-500/40 rounded-2xl shadow-2xl shadow-violet-950/50 p-3.5 space-y-2.5">
        {/* Cabeçalho do Card */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-violet-400 animate-bounce" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300">
                  Baixando ({activeCount})
                </span>
                <span className="text-xs font-black text-violet-400">{percentage}%</span>
              </div>
              <p className="text-xs font-semibold text-neutral-200 truncate mt-0.5" title={title}>
                {title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activeCount > 1 && (
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-1 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition cursor-pointer"
                title={isExpanded ? 'Recolher fila' : 'Ver todos os downloads'}
                aria-label={isExpanded ? 'Recolher fila' : 'Ver todos os downloads'}
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            )}
            <Link
              href="/offline"
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white text-[11px] font-bold transition flex items-center gap-1"
              title="Abrir página de downloads"
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            </Link>
          </div>
        </div>

        {/* Barra de Progresso Principal */}
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all duration-300 relative"
              style={{ width: `${Math.max(4, percentage)}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-neutral-400 font-medium">
            <span>
              {formatDownloadSize(progress.bytesReceived)} de{' '}
              {progress.totalBytes > 0 ? formatDownloadSize(progress.totalBytes) : 'calculando...'}
            </span>
            <span className="text-violet-300 font-semibold">{percentage}%</span>
          </div>
        </div>

        {/* Fila expandida caso haja múltiplos downloads */}
        {isExpanded && activeList.length > 1 && (
          <div className="pt-2 border-t border-white/10 space-y-2 max-h-48 overflow-y-auto pr-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Na Fila:</p>
            {activeList.slice(1).map((item) => (
              <div key={item.id} className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-neutral-300 text-[11px]" title={item.title}>
                    {item.title}
                  </span>
                  <span className="text-[10px] font-bold text-violet-400 shrink-0">
                    {item.progress.percentage}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${Math.max(4, item.progress.percentage)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
