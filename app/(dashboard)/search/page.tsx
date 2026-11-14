'use client';
import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Film,
  Tv,
  Video,
  Layers,
  LayoutGrid,
  LayoutList,
  X,
  Compass,
} from 'lucide-react';
import { BaseStreamItem, StreamType } from '@/lib/types';
import { searchAllStreams } from '@/lib/search-index';
import MediaCard from '@/components/media/MediaCard';

interface CategoryGroup {
  id: string;
  name: string;
  type: StreamType;
  items: BaseStreamItem[];
}

function NetflixCategoryCarousel({
  group,
  query,
}: {
  group: CategoryGroup;
  query: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 600;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const top10 = group.items.slice(0, 10);
  const typeLabel =
    group.type === 'series'
      ? 'Séries'
      : group.type === 'movie'
      ? 'Filmes'
      : 'Ao Vivo';

  return (
    <div className="space-y-3">
      {/* Cabeçalho da Categoria com Título e Botão de Ver Mais */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 border-b border-white/5 pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-600/30 text-violet-300 border border-violet-500/20 shrink-0">
            {typeLabel}
          </span>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
            {group.name}
          </h2>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <span className="text-xs text-neutral-400 font-medium">
            ({group.items.length} {group.items.length === 1 ? 'resultado' : 'resultados'})
          </span>

          <button
            onClick={() =>
              router.push(
                `/catalog?category=${group.id}&type=${group.type}&q=${encodeURIComponent(query)}`
              )
            }
            aria-label={`Mais Resultados em ${group.name}`}
            title={`Mais Resultados em ${group.name}`}
            className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition cursor-pointer p-1 sm:p-0 rounded-lg bg-white/5 sm:bg-transparent border border-white/10 sm:border-0"
          >
            <span className="hidden sm:inline">Mais Resultados em {group.name}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Carrossel Horizontal Estilo Netflix */}
      <div className="relative group/carousel">
        {/* Botão Scroll Esquerda */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-violet-600 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-all shadow-xl border border-white/10 cursor-pointer backdrop-blur-sm -ml-3"
          aria-label="Rolar para esquerda"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Container dos Cards */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth no-scrollbar"
        >
          {top10.map((item) => (
            <div
              key={`${item.stream_type}_${item.stream_id}`}
              className={group.type === 'live' ? 'w-56 sm:w-64 shrink-0' : 'w-40 sm:w-48 shrink-0'}
            >
              <MediaCard item={item} />
            </div>
          ))}

          {/* Card Final: Mais Resultados nesta Categoria */}
          <div className={group.type === 'live' ? 'w-56 sm:w-64 shrink-0 flex' : 'w-40 sm:w-48 shrink-0 flex'}>
            <button
              onClick={() =>
                router.push(
                  `/catalog?category=${group.id}&type=${group.type}&q=${encodeURIComponent(query)}`
                )
              }
              className={`w-full ${group.type === 'live' ? 'min-h-[170px] sm:min-h-[190px]' : 'min-h-[260px] sm:min-h-[300px]'} rounded-2xl bg-[#13141b]/80 hover:bg-violet-950/40 border border-white/10 hover:border-violet-500/50 p-4 flex flex-col items-center justify-center text-center gap-3 transition-all group/btn cursor-pointer shadow-lg`}
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-600/20 group-hover/btn:bg-violet-600 text-violet-400 group-hover/btn:text-white flex items-center justify-center transition-all shadow-md">
                <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform" />
              </div>
              <span className="text-xs font-bold text-neutral-200 group-hover/btn:text-white transition-colors">
                Mais Resultados em {group.name}
              </span>
              <span className="text-[10px] text-neutral-400">
                Ver todos os títulos no catálogo
              </span>
            </button>
          </div>
        </div>

        {/* Botão Scroll Direita */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/80 hover:bg-violet-600 text-white flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-all shadow-xl border border-white/10 cursor-pointer backdrop-blur-sm -mr-3"
          aria-label="Rolar para direita"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qParam = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState(qParam);
  const [results, setResults] = useState<BaseStreamItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'category' | 'title'>('category');

  // Sincroniza estado local com URL
  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  // Executa busca completa sempre que qParam mudar
  useEffect(() => {
    if (!qParam.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function executeSearch() {
      setLoading(true);
      try {
        const items = await searchAllStreams(qParam, 500);
        if (isMounted) {
          setResults(items);
        }
      } catch (err) {
        console.error('Erro na pesquisa detalhada:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    executeSearch();
    return () => {
      isMounted = false;
    };
  }, [qParam]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchInput.trim())}`);
  };

  // Agrupamento dos resultados por Categoria
  const groupedCategories: CategoryGroup[] = useMemo(() => {
    if (!results || results.length === 0) return [];

    const map = new Map<string, CategoryGroup>();

    results.forEach((item) => {
      const catId = String(item.category_id || 'geral');
      const catName = item.category_name || 'Geral';
      const key = `${item.stream_type}_${catId}`;

      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        map.set(key, {
          id: catId,
          name: catName,
          type: item.stream_type,
          items: [item],
        });
      }
    });

    // Ordena categorias pela quantidade de resultados decrescente
    return Array.from(map.values()).sort(
      (a, b) => b.items.length - a.items.length
    );
  }, [results]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 min-h-[80vh]">
      {/* 1. Barra de Busca Superior com visual Miruro OLED */}
      <div className="relative max-w-3xl mx-auto">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-5 h-5 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Digite o nome de um filme, anime, série ou canal..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[#13141b]/95 border border-white/10 hover:border-violet-500/40 focus:border-violet-500 text-sm text-white rounded-2xl pl-12 pr-28 py-3.5 focus:outline-none transition-all placeholder:text-neutral-500 shadow-2xl"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-24 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition shadow-md shadow-violet-600/30 cursor-pointer"
          >
            Buscar
          </button>
        </form>

        {/* Sugestões Rápidas de Termos */}
        <div className="flex flex-wrap items-center gap-2 mt-3 justify-center">
          <span className="text-[11px] text-neutral-500 font-medium">Populares:</span>
          {['Animes', 'Ação', 'Marvel', 'HBO', 'Futebol', 'Desenhos', 'Comédia'].map((tag) => (
            <button
              key={`search_tag_${tag}`}
              onClick={() => {
                setSearchInput(tag);
                router.push(`/search?q=${encodeURIComponent(tag)}`);
              }}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-violet-300 text-[11px] font-semibold border border-white/5 transition cursor-pointer"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Cabeçalho dos Resultados */}
      {qParam && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              Resultados para &quot;{qParam}&quot;
            </h1>
            <p className="text-xs text-neutral-400 mt-1">
              {loading
                ? 'Varrendo todo o catálogo...'
                : `${results.length} títulos encontrados em ${groupedCategories.length} categorias`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('category')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'category'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Por Categoria</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('title')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'title'
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Por Título</span>
              </button>
            </div>

            <Link
              href={`/catalog?q=${encodeURIComponent(qParam)}`}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Ver no Catálogo Completo</span>
            </Link>
          </div>
        </div>
      )}

      {/* 3. Estados de Carregamento e Vazio */}
      {loading ? (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Buscando em todo o acervo...</p>
        </div>
      ) : !qParam ? (
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-600/10 border border-violet-500/20 text-violet-400 flex items-center justify-center mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white">Pesquise o que deseja assistir</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Digite o nome de qualquer filme, série, anime ou canal de TV ao vivo no campo acima
            para encontrar instantaneamente.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="max-w-md mx-auto text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 text-neutral-500 flex items-center justify-center mx-auto">
            <Compass className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-white">Nenhum resultado encontrado</h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Não encontramos nenhum título correspondente a &quot;{qParam}&quot;. Tente verificar a
            ortografia ou buscar por termos mais genéricos.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href="/catalog"
              className="px-4 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition shadow-lg shadow-violet-600/20"
            >
              Explorar Catálogo
            </Link>
          </div>
        </div>
      ) : viewMode === 'title' ? (
        /* 4a. Visualização Agrupada por Título (todos os títulos juntos em sequência) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((item) => (
            <MediaCard key={`title_${item.stream_type}_${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        /* 4b. Carrosséis Horizontais Agrupados por Categoria estilo Netflix */
        <div className="space-y-10">
          {groupedCategories.map((group) => (
            <NetflixCategoryCarousel
              key={`category_row_${group.type}_${group.id}`}
              group={group}
              query={qParam}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando pesquisa...</p>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
