'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Dashboard Error]:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
        <AlertCircle className="w-7 h-7" />
      </div>
      <h2 className="text-xl font-bold text-white">Não foi possível carregar a página</h2>
      <p className="text-xs sm:text-sm text-neutral-400 max-w-md">
        Ocorreu um erro temporário ao carregar as informações. Tente recarregar ou volte para o catálogo.
      </p>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-lg shadow-violet-600/30 transition cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Tentar novamente</span>
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-semibold border border-white/10 transition"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Início</span>
        </Link>
      </div>
    </div>
  );
}
