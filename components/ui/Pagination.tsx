'use client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalItems,
  pageSize = 50,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  if (totalItems <= pageSize) {
    return (
      <div className="py-4 text-xs text-neutral-400 text-center">
        Mostrando todos os <span className="text-white font-bold">{totalItems}</span> itens
      </div>
    );
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Gera números de página inteligentes ao redor da página atual
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className="p-4 bg-[#13141b] border border-white/10 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
      <div className="text-xs text-neutral-400">
        Mostrando <span className="text-white font-bold">{startItem}</span> a{' '}
        <span className="text-white font-bold">{endItem}</span> de{' '}
        <span className="text-violet-400 font-bold">{totalItems}</span> itens (50 por página)
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {/* Primeira Página */}
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Primeira Página"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Anterior */}
        <button
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Anterior
        </button>

        {/* Números das páginas */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`ellipsis_${idx}`} className="px-2 text-xs text-neutral-500">
                  ...
                </span>
              );
            }
            const isCurrent = p === currentPage;
            return (
              <button
                key={`page_${p}`}
                onClick={() => onPageChange(Number(p))}
                className={`w-8 h-8 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                  isCurrent
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/40 border border-violet-400/40'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Próxima */}
        <button
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 transition"
        >
          Próxima <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Última Página */}
        <button
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
          title="Última Página"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
