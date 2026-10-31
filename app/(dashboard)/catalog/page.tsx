'use client';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Play,
  Heart,
  CheckCircle2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Info,
  X,
} from 'lucide-react';
import { localDB, LocalCategory } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import { getWatchUrl, getInfoUrl } from '@/lib/routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import { expandQueryWithAliases } from '@/lib/anime-aliases';
import Pagination from '@/components/ui/Pagination';

const PAGE_SIZE = 50;

type SortField = 'title' | 'stream_type' | 'category_name' | 'rating' | 'watched';
type SortOrder = 'asc' | 'desc';

interface CategoryOption {
  id: string;
  name: string;
  type?: 'live' | 'movie' | 'series';
  count: number;
}

function cleanTitleForFilter(raw: string): string {
  let title = raw;
  // Remove anos, tags entre colchetes/parênteses e resoluções
  title = title.replace(/\b(19\d\d|20\d\d)\b/g, '');
  title = title.replace(/\[.*?\]|\(.*?\)/g, '');
  title = title.replace(/\b(4k|fhd|hd|sd|hevc|h265|dublado|legendado|leg|dub|dual|audio|completo|temporada|season|t\d+|ep\d+)\b/gi, '');
  title = title.replace(/[-_.:]/g, ' ');
  title = title.replace(/\s+/g, ' ').trim();

  // Se o título tiver subtítulos ou for longo, pega as primeiras 3 palavras para agrupar franquias/sagas
  const words = title.split(' ');
  if (words.length > 3) {
    return words.slice(0, 3).join(' ');
  }
  return title;
}

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramCat = searchParams.get('category') || searchParams.get('cat');
  const paramType = searchParams.get('type');
  const paramQ = searchParams.get('q');
  const paramPageRaw = searchParams.get('page');
  const paramPage = paramPageRaw ? parseInt(paramPageRaw, 10) || 1 : 1;

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched } = useWatched();

  const [allItems, setAllItems] = useState<BaseStreamItem[]>([]);
  const [allCategories, setAllCategories] = useState<LocalCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros inicializados com suporte a URL searchParams
  const [searchTerm, setSearchTerm] = useState(paramQ || '');
  const [selectedType, setSelectedType] = useState<string>(paramType || 'all');
  const [selectedCategory, setSelectedCategory] = useState<string>(paramCat || 'all');
  const [currentPage, setCurrentPage] = useState(paramPage);

  // Atualiza a URL na barra de navegação sem reload e sem bater no servidor
  const pushCatalogUrlState = useCallback(
    (type: string, cat: string, page: number, q: string, replace = false) => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams();
      if (type && type !== 'all') sp.set('type', type);
      if (cat && cat !== 'all') sp.set('category', cat);
      if (page > 1) sp.set('page', String(page));
      if (q && q.trim()) sp.set('q', q.trim());
      const qs = sp.toString();
      const target = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      if (replace) {
        window.history.replaceState({ type, cat, page, q }, '', target);
      } else {
        window.history.pushState({ type, cat, page, q }, '', target);
      }
    },
    []
  );

  // Sincroniza se query params mudarem externamente ou no botão Voltar/Avançar (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      setSelectedType(sp.get('type') || 'all');
      setSelectedCategory(sp.get('category') || sp.get('cat') || 'all');
      const rawP = sp.get('page');
      setCurrentPage(rawP ? parseInt(rawP, 10) || 1 : 1);
      setSearchTerm(sp.get('q') || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (paramCat) setSelectedCategory(paramCat);
    if (paramType) setSelectedType(paramType);
    if (paramQ) setSearchTerm(paramQ);
    if (paramPageRaw) setCurrentPage(paramPage);
  }, [paramCat, paramType, paramQ, paramPageRaw, paramPage]);

  // Estados de Ordenação e Reorganização
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [reorganizedTitle, setReorganizedTitle] = useState<string | null>(null);

  // Carrega todos os itens e categorias do IndexedDB
  useEffect(() => {
    async function loadData() {
      if (!localDB) return;
      try {
        const [streams, cats] = await Promise.all([
          localDB.streams.toArray(),
          localDB.categories.toArray(),
        ]);

        setAllItems(streams as unknown as BaseStreamItem[]);
        setAllCategories(cats as LocalCategory[]);
      } catch (e) {
        console.error('Erro ao carregar catálogo completo:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Categorias disponíveis filtradas ESTRITAMENTE pelo tipo selecionado
  const availableCategories = useMemo<CategoryOption[]>(() => {
    const map = new Map<string, CategoryOption>();

    // 1. Mapeia a partir do banco de categorias filtrando por tipo
    allCategories.forEach((c) => {
      if (selectedType === 'all' || c.type === selectedType) {
        map.set(String(c.category_id), {
          id: String(c.category_id),
          name: c.category_name,
          type: c.type,
          count: 0,
        });
      }
    });

    // 2. Mapeia e conta a partir dos itens sincronizados do tipo ativo
    allItems.forEach((item) => {
      if (selectedType === 'all' || item.stream_type === selectedType) {
        const catId = String(item.category_id || 'geral');
        const catName = item.category_name || 'Geral';
        const existing = map.get(catId);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(catId, {
            id: catId,
            name: catName,
            type: item.stream_type,
            count: 1,
          });
        }
      }
    });

    // Ordena as categorias alfabeticamente
    return Array.from(map.values())
      .filter((c) => c.count > 0 || allCategories.some((orig) => String(orig.category_id) === c.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }, [allCategories, allItems, selectedType]);

  // Manipulador de troca de Tipo (reseta a categoria para evitar filtros órfãos)
  const handleTypeChange = (newType: string) => {
    setSelectedType(newType);
    setSelectedCategory('all');
    setCurrentPage(1);
    pushCatalogUrlState(newType, 'all', 1, searchTerm);
  };

  // Manipulador de ordenação pelas colunas (títulos da tabela)
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortField(null);
        setSortOrder('asc');
      }
    } else {
      setSortField(field);
      setSortOrder(field === 'rating' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  // Reorganizar a lista com base no título clicado
  const handleReorganizeByItem = useCallback((item: BaseStreamItem) => {
    const baseKeyword = cleanTitleForFilter(item.title || item.name);
    setSearchTerm(baseKeyword);
    setReorganizedTitle(item.title || item.name);
    setSelectedCategory('all');
    setCurrentPage(1);
  }, []);

  // Limpar reorganização por título
  const handleClearReorganize = () => {
    setReorganizedTitle(null);
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Filtragem e Ordenação dinâmica da listagem
  const filteredAndSortedItems = useMemo(() => {
    const filtered = allItems.filter((item) => {
      // 1. Filtro estrito por tipo de stream
      if (selectedType !== 'all' && item.stream_type !== selectedType) {
        return false;
      }
      // 2. Filtro por categoria
      if (selectedCategory !== 'all' && String(item.category_id) !== selectedCategory) {
        return false;
      }
      // 3. Busca por texto com suporte a sinônimos e títulos multilíngues de animes
      if (searchTerm.trim()) {
        const variants = expandQueryWithAliases(searchTerm);
        const normalizeStr = (s: string) =>
          s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const targetText = normalizeStr(`${item.title || item.name || ''} ${item.category_name || ''}`);
        const matchesAnyVariant = variants.some((v) => {
          const tokens = normalizeStr(v).split(/\s+/).filter(Boolean);
          return tokens.length > 0 && tokens.every((tok) => targetText.includes(tok));
        });
        if (!matchesAnyVariant) return false;
      }
      return true;
    });

    // Se nenhuma ordenação por coluna foi clicada:
    if (!sortField) {
      if (reorganizedTitle) {
        const q = searchTerm.toLowerCase();
        return [...filtered].sort((a, b) => {
          const aExact = (a.title || a.name || '').toLowerCase().startsWith(q) ? 1 : 0;
          const bExact = (b.title || b.name || '').toLowerCase().startsWith(q) ? 1 : 0;
          return bExact - aExact;
        });
      }
      return filtered;
    }

    // Ordenação ativa por coluna clicada
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        const titleA = a.title || a.name || '';
        const titleB = b.title || b.name || '';
        cmp = titleA.localeCompare(titleB, 'pt-BR', { sensitivity: 'base', numeric: true });
      } else if (sortField === 'category_name') {
        const catA = a.category_name || '';
        const catB = b.category_name || '';
        cmp = catA.localeCompare(catB, 'pt-BR', { sensitivity: 'base' });
      } else if (sortField === 'stream_type') {
        cmp = a.stream_type.localeCompare(b.stream_type);
      } else if (sortField === 'rating') {
        const rateA = Number(a.rating) || 0;
        const rateB = Number(b.rating) || 0;
        cmp = rateA - rateB;
      } else if (sortField === 'watched') {
        const watchA = isWatched(a.stream_id, a.stream_type) ? 1 : 0;
        const watchB = isWatched(b.stream_id, b.stream_type) ? 1 : 0;
        cmp = watchA - watchB;
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [allItems, selectedType, selectedCategory, searchTerm, sortField, sortOrder, reorganizedTitle, isWatched]);

  // Paginação exata de 50 itens
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAndSortedItems.slice(start, start + PAGE_SIZE);
  }, [filteredAndSortedItems, currentPage]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    pushCatalogUrlState(selectedType, selectedCategory, newPage, searchTerm);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePlayItem = (item: BaseStreamItem) => {
    router.push(getWatchUrl(item.stream_type, item.stream_id));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            Catálogo Geral <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/30">Texto Puro</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Visualização de alta performance. Clique no cabeçalho das colunas para ordenar ou clique no nome de qualquer item para reorganizar a lista.
          </p>
        </div>

        <div className="text-xs font-semibold text-neutral-400 bg-[#13141b] border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
          <span>Total:</span>
          <span className="text-violet-400 font-bold">{filteredAndSortedItems.length}</span>
          <span>itens encontrados</span>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Campo de Pesquisa */}
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por título ou gênero..."
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              if (reorganizedTitle && val !== searchTerm) {
                setReorganizedTitle(null);
              }
              setCurrentPage(1);
              pushCatalogUrlState(selectedType, selectedCategory, 1, val, true);
            }}
            className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white focus:outline-none transition"
          />
        </div>

        {/* Filtro por Tipo */}
        <div className="sm:col-span-3">
          <select
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 focus:outline-none transition cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="live">TV ao Vivo (Canais)</option>
            <option value="movie">Filmes</option>
            <option value="series">Séries</option>
          </select>
        </div>

        {/* Filtro por Categoria - Filtrado Dinamicamente por Tipo */}
        <div className="sm:col-span-3">
          <select
            value={selectedCategory}
            onChange={(e) => {
              const newCat = e.target.value;
              setSelectedCategory(newCat);
              setCurrentPage(1);
              pushCatalogUrlState(selectedType, newCat, 1, searchTerm);
            }}
            className="w-full bg-[#13141b] border border-white/10 hover:border-violet-500/40 focus:border-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-neutral-200 focus:outline-none transition cursor-pointer"
          >
            <option value="all">
              {selectedType === 'live'
                ? 'Todas as Categorias (Canais)'
                : selectedType === 'movie'
                ? 'Todas as Categorias (Filmes)'
                : selectedType === 'series'
                ? 'Todas as Categorias (Séries)'
                : 'Todas as Categorias'}
            </option>
            {availableCategories.map((cat) => (
              <option key={`cat_opt_${cat.id}`} value={cat.id}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso de Lista Reorganizada por Título Clicado */}
      {reorganizedTitle && (
        <div className="flex items-center justify-between gap-3 p-3 px-4 rounded-2xl bg-violet-950/40 border border-violet-500/40 text-xs text-violet-200 backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
            <span className="truncate">
              Lista reorganizada com base em: <strong className="text-white">&ldquo;{reorganizedTitle}&rdquo;</strong>
            </span>
          </div>
          <button
            onClick={handleClearReorganize}
            className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition cursor-pointer flex items-center gap-1 shrink-0 text-[11px]"
          >
            <X className="w-3 h-3" /> Limpar filtro
          </button>
        </div>
      )}

      {/* Aviso de Ordenação Ativa */}
      {sortField && (
        <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
          <span>
            Ordenando por:{' '}
            <strong className="text-violet-300">
              {sortField === 'title'
                ? 'Título'
                : sortField === 'category_name'
                ? 'Categoria'
                : sortField === 'stream_type'
                ? 'Tipo'
                : sortField === 'rating'
                ? 'Nota'
                : 'Status'}
            </strong>{' '}
            ({sortOrder === 'asc' ? 'A → Z / Crescente' : 'Z → A / Decrescente'})
          </span>
          <button
            onClick={() => {
              setSortField(null);
              setSortOrder('asc');
            }}
            className="text-[11px] text-neutral-400 hover:text-white underline cursor-pointer"
          >
            Remover ordenação
          </button>
        </div>
      )}

      {/* Tabela de Listagem com Cabeçalhos Clicáveis */}
      <div className="bg-[#13141b] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center text-xs text-neutral-400 space-y-2">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Carregando itens do catálogo local...</p>
          </div>
        ) : paginatedItems.length === 0 ? (
          <div className="p-16 text-center text-xs text-neutral-500 space-y-2">
            <p>Nenhum item corresponde aos filtros selecionados.</p>
            {reorganizedTitle && (
              <button
                onClick={handleClearReorganize}
                className="px-3.5 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-semibold cursor-pointer"
              >
                Voltar à lista completa
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0b0c10] text-neutral-400 font-bold border-b border-white/5 uppercase tracking-wider text-[10px]">
                  {/* Coluna Status Clicável */}
                  <th
                    onClick={() => handleSort('watched')}
                    className="py-3 px-4 w-14 text-center cursor-pointer hover:text-white transition select-none group"
                    title="Clique para ordenar por assistidos"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status</span>
                      {sortField === 'watched' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-violet-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Título Clicável */}
                  <th
                    onClick={() => handleSort('title')}
                    className="py-3 px-4 cursor-pointer hover:text-white transition select-none group"
                    title="Clique para ordenar alfabeticamente por título"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Título</span>
                      {sortField === 'title' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Tipo Clicável */}
                  <th
                    onClick={() => handleSort('stream_type')}
                    className="py-3 px-4 cursor-pointer hover:text-white transition select-none group"
                    title="Clique para ordenar por tipo (Ao Vivo, Filme, Série)"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Tipo</span>
                      {sortField === 'stream_type' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Categoria Clicável */}
                  <th
                    onClick={() => handleSort('category_name')}
                    className="py-3 px-4 cursor-pointer hover:text-white transition select-none group"
                    title="Clique para ordenar alfabeticamente por categoria"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Categoria</span>
                      {sortField === 'category_name' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </div>
                  </th>

                  {/* Coluna Nota Clicável */}
                  <th
                    onClick={() => handleSort('rating')}
                    className="py-3 px-4 w-20 text-center cursor-pointer hover:text-white transition select-none group"
                    title="Clique para ordenar por classificação"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Nota</span>
                      {sortField === 'rating' ? (
                        sortOrder === 'asc' ? (
                          <ArrowUp className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                          <ArrowDown className="w-3.5 h-3.5 text-violet-400" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400" />
                      )}
                    </div>
                  </th>

                  <th className="py-3 px-4 w-36 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedItems.map((item) => {
                  const watched = isWatched(item.stream_id, item.stream_type);
                  const favorited = isFavorite(item.stream_id, item.stream_type);
                  const isCurrentReorganized =
                    reorganizedTitle && (item.title || item.name) === reorganizedTitle;

                  return (
                    <tr
                      key={`${item.stream_type}_${item.stream_id}`}
                      className={`hover:bg-white/[0.03] transition-colors group ${
                        isCurrentReorganized ? 'bg-violet-950/20 border-l-2 border-violet-500' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        {watched ? (
                          <span title="Conteúdo já assistido">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto fill-emerald-500/20" />
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-neutral-700 block mx-auto" />
                        )}
                      </td>

                      {/* Nome do Item: Clicável para reorganizar a lista com base neste título */}
                      <td className="py-3 px-4 font-semibold text-neutral-100 group-hover:text-violet-400 transition-colors">
                        <div className="flex items-center gap-2 max-w-md">
                          <button
                            onClick={() => handleReorganizeByItem(item)}
                            className="text-left hover:underline hover:text-violet-300 truncate font-semibold block cursor-pointer transition-colors"
                            title="Clique para reorganizar a lista e encontrar títulos relacionados a este"
                          >
                            {item.title || item.name}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/5 text-neutral-300 border border-white/5">
                          {item.stream_type === 'live' ? 'TV' : item.stream_type === 'movie' ? 'Filme' : 'Série'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-neutral-400 truncate max-w-xs">
                        {item.category_name || 'Geral'}
                      </td>

                      <td className="py-3 px-4 text-center text-amber-400 font-medium">
                        {item.rating ? `★ ${item.rating}` : '-'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Botão Ver Resumo / Detalhes */}
                          <Link
                            href={getInfoUrl(item.stream_type, item.stream_id)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/5 transition"
                            title="Ver Resumo / Detalhes"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </Link>

                          {/* Botão Favoritar */}
                          <button
                            onClick={() => {
                              if (favorited) {
                                removeFavorite(item.stream_id, item.stream_type);
                              } else {
                                addFavorite({
                                  streamId: item.stream_id,
                                  streamType: item.stream_type,
                                  title: item.title || item.name,
                                  posterUrl: item.stream_icon,
                                  categoryName: item.category_name,
                                  rating: item.rating,
                                });
                              }
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${
                              favorited
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                : 'bg-white/5 border-white/5 text-neutral-400 hover:text-white'
                            }`}
                            title={favorited ? 'Remover dos favoritos' : 'Favoritar'}
                          >
                            <Heart className={`w-3.5 h-3.5 ${favorited ? 'fill-rose-500' : ''}`} />
                          </button>

                          {/* Botão Assistir */}
                          <button
                            onClick={() => handlePlayItem(item)}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-md shadow-violet-600/20 transition flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            Assistir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação Fixa de 50 itens */}
      {!loading && filteredAndSortedItems.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredAndSortedItems.length}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando catálogo...</p>
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
