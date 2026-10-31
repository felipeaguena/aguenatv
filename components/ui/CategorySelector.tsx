'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Layers, Check, ChevronDown, X, Filter } from 'lucide-react';

interface CategorySelectorProps {
  categories: { id: string; name: string }[];
  selectedCat: string;
  onSelectCat: (id: string) => void;
  totalCount?: number;
  titleSearch?: string;
  onTitleSearchChange?: (val: string) => void;
  titlePlaceholder?: string;
}

function cleanCategoryName(raw: string): string {
  return raw
    .replace(/^Canais\s*\|\s*/i, '')
    .replace(/^Filmes\s*\|\s*/i, '')
    .replace(/^Séries\s*\|\s*/i, '')
    .replace(/^Series\s*\|\s*/i, '')
    .trim();
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export default function CategorySelector({
  categories,
  selectedCat,
  onSelectCat,
  totalCount,
  titleSearch,
  onTitleSearchChange,
  titlePlaceholder = 'Buscar por título...',
}: CategorySelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Encontra o nome da categoria atualmente selecionada
  const selectedCategoryObj = useMemo(() => {
    return categories.find((c) => c.id === selectedCat);
  }, [categories, selectedCat]);

  const selectedCategoryLabel = useMemo(() => {
    if (selectedCat === 'all' || !selectedCategoryObj) {
      return 'Todas as Categorias';
    }
    return cleanCategoryName(selectedCategoryObj.name);
  }, [selectedCat, selectedCategoryObj]);

  // Filtra as categorias dentro do dropdown conforme a digitação no campo de categoria
  const filteredCategories = useMemo(() => {
    const q = normalize(categorySearchQuery);
    if (!q) return categories;
    return categories.filter((c) => normalize(c.name).includes(q));
  }, [categories, categorySearchQuery]);

  const handleSelectCategory = (id: string) => {
    onSelectCat(id);
    setCategorySearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleClearCategory = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCat('all');
    setCategorySearchQuery('');
  };

  const handleClearTitle = () => {
    if (onTitleSearchChange) {
      onTitleSearchChange('');
    }
  };

  const hasActiveFilters = selectedCat !== 'all' || Boolean(titleSearch?.trim());

  return (
    <div
      className={`bg-[#13141b]/90 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md space-y-4 relative ${
        isDropdownOpen ? 'z-50' : 'z-20'
      }`}
    >
      {/* Cabeçalho da Seção de Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase">
              Filtros do Catálogo
            </h3>
            <p className="text-[11px] text-neutral-400">
              Busque por título ou filtre por categoria de forma independente
            </p>
          </div>
        </div>

        {/* Resumo de Filtros Ativos com Botão de Limpar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {selectedCat !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-600/20 border border-violet-500/30 text-[11px] font-semibold text-violet-300">
                <Layers className="w-3 h-3 text-violet-400" />
                <span className="max-w-[140px] truncate">{selectedCategoryLabel}</span>
                <button
                  type="button"
                  onClick={handleClearCategory}
                  className="hover:text-white p-0.5 rounded cursor-pointer"
                  title="Limpar categoria"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {titleSearch && titleSearch.trim() && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
                <Search className="w-3 h-3 text-emerald-400" />
                <span className="max-w-[140px] truncate">&quot;{titleSearch}&quot;</span>
                <button
                  type="button"
                  onClick={handleClearTitle}
                  className="hover:text-white p-0.5 rounded cursor-pointer"
                  title="Limpar busca de título"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                onSelectCat('all');
                if (onTitleSearchChange) onTitleSearchChange('');
                setCategorySearchQuery('');
              }}
              className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer ml-1"
            >
              Limpar tudo
            </button>
          </div>
        )}
      </div>

      {/* Grid com os Dois Campos de Busca Independentes */}
      <div className={`grid grid-cols-1 ${onTitleSearchChange ? 'md:grid-cols-2' : ''} gap-3.5`}>
        {/* CAMPO 1: Busca de Títulos (Filtra ao digitar, sem sugestões flutuantes) */}
        {onTitleSearchChange && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-neutral-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-violet-400" />
              <span>Buscar por Título</span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={titlePlaceholder}
                value={titleSearch || ''}
                onChange={(e) => onTitleSearchChange(e.target.value)}
                className="w-full h-11 bg-[#0b0c10] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-10 pr-9 text-xs text-white placeholder:text-neutral-500 focus:outline-none transition shadow-inner font-medium"
              />
              {titleSearch && (
                <button
                  type="button"
                  onClick={handleClearTitle}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 rounded-md transition cursor-pointer"
                  title="Limpar título"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* CAMPO 2: Busca e Seleção de Categorias (Menu Dropdown com Digitação em Tempo Real) */}
        <div className="space-y-1.5 relative z-50" ref={dropdownRef}>
          <label className="text-[11px] font-bold text-neutral-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Filtrar por Categoria</span>
            </span>
            {selectedCat !== 'all' && (
              <span className="text-[10px] text-violet-400 font-medium">
                Ativa: {selectedCategoryLabel}
              </span>
            )}
          </label>

          <div className="relative">
            {/* Campo de Entrada que Abre o Dropdown e Permite Digitar */}
            <div
              onClick={() => {
                setIsDropdownOpen(true);
                categoryInputRef.current?.focus();
              }}
              className={`w-full h-11 bg-[#0b0c10] border rounded-xl pl-10 pr-16 flex items-center transition cursor-pointer relative shadow-inner ${
                isDropdownOpen
                  ? 'border-violet-500 ring-1 ring-violet-500/30'
                  : 'border-white/10 hover:border-violet-500/40'
              }`}
            >
              <Layers className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />

              <input
                ref={categoryInputRef}
                type="text"
                placeholder={
                  selectedCat === 'all'
                    ? 'Digite para buscar categoria...'
                    : `Categoria: ${selectedCategoryLabel}`
                }
                value={categorySearchQuery}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setCategorySearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                className="w-full bg-transparent text-xs text-white placeholder:text-neutral-500 focus:outline-none font-medium truncate"
              />

              {/* Controles de Ação na Direita (Limpar e Chevron) */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {(selectedCat !== 'all' || categorySearchQuery) && (
                  <button
                    type="button"
                    onClick={handleClearCategory}
                    className="text-neutral-400 hover:text-white p-1 rounded-md transition cursor-pointer"
                    title="Redefinir para todas as categorias"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDropdownOpen(!isDropdownOpen);
                  }}
                  className="text-neutral-400 hover:text-violet-400 p-1 rounded-md transition cursor-pointer"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isDropdownOpen ? 'rotate-180 text-violet-400' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Menu Suspenso de Resultados Relacionados com Base nas Letras Digitadas */}
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[#181924] border border-white/10 rounded-2xl shadow-2xl p-2 max-h-72 overflow-y-auto space-y-1 backdrop-blur-xl animate-in fade-in duration-150 ring-1 ring-black/50">
                {/* Opção Fixa no Topo: Todas as Categorias */}
                <button
                  type="button"
                  onClick={() => handleSelectCategory('all')}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer border ${
                    selectedCat === 'all'
                      ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-600/30'
                      : 'bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white border-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-violet-300" />
                    <span>Todas as Categorias</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {totalCount !== undefined && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-black/30 text-neutral-300 font-bold">
                        {totalCount} itens
                      </span>
                    )}
                    {selectedCat === 'all' && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>

                {/* Divisor Visual se houver categorias */}
                {filteredCategories.length > 0 && (
                  <div className="px-2 pt-2 pb-1 flex items-center justify-between text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                    <span>
                      {categorySearchQuery.trim()
                        ? `Resultados para "${categorySearchQuery}" (${filteredCategories.length})`
                        : `Categorias Disponíveis (${categories.length})`}
                    </span>
                  </div>
                )}

                {/* Lista de Categorias Filtradas pelas Letras Digitadas */}
                {filteredCategories.length > 0 ? (
                  filteredCategories.map((c) => {
                    const isSelected = selectedCat === c.id;
                    const cleanName = cleanCategoryName(c.name);

                    return (
                      <button
                        type="button"
                        key={`cat_opt_${c.id}`}
                        onClick={() => handleSelectCategory(c.id)}
                        className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-violet-600 text-white font-bold shadow-md shadow-violet-600/30'
                            : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isSelected ? 'bg-white' : 'bg-violet-400'
                            }`}
                          />
                          <span className="truncate">{cleanName}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0 ml-2" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="py-6 px-4 text-center space-y-1">
                    <p className="text-xs font-semibold text-neutral-300">
                      Nenhuma categoria encontrada
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Não encontramos categorias com as letras &quot;{categorySearchQuery}&quot;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
