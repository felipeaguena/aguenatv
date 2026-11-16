'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Layers,
  Heart,
  Sparkles,
  Play,
  Tv,
  Film,
  Video,
  SlidersHorizontal,
  ArrowUpDown,
  RotateCw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem } from '@/lib/types';
import { getSortScore, cleanCategoryName, isRecentlyAdded } from '@/lib/stream-utils';
import { getTvWatchUrl } from '@/lib/tv-routes';
import { useFavorites } from '@/hooks/useFavorites';
import { useWatched } from '@/hooks/useWatched';
import TvMediaCard from '@/components/tv/TvMediaCard';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface TvCategoryCatalogProps {
  streamType: 'live' | 'movie' | 'series';
  title: string;
  subtitle: string;
}

const BATCH_SIZE = 48;

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export default function TvCategoryCatalog({
  streamType,
  title,
  subtitle,
}: TvCategoryCatalogProps) {
  const searchParams = useSearchParams();
  const initialCat = searchParams.get('cat') || 'all';

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { isWatched } = useWatched();

  const [items, setItems] = useState<BaseStreamItem[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [prevInitialCat, setPrevInitialCat] = useState(initialCat);
  const [selectedCat, setSelectedCat] = useState<string>(initialCat);
  const [catFilter, setCatFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | '4k' | 'dubbed' | 'unwatched'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'rating'>('recent');
  const [visibleLimit, setVisibleLimit] = useState(BATCH_SIZE);
  const [mobileCatsOpen, setMobileCatsOpen] = useState(false);

  // Preview ao vivo para TV Ao Vivo (Zap rápido)
  const [focusedItem, setFocusedItem] = useState<BaseStreamItem | null>(null);

  if (prevInitialCat !== initialCat) {
    setPrevInitialCat(initialCat);
    setSelectedCat(initialCat);
    setVisibleLimit(BATCH_SIZE);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      if (!localDB) return;
      try {
        const [rawStreams, rawCats] = await Promise.all([
          localDB.streams.where('stream_type').equals(streamType).toArray(),
          localDB.categories.where('type').equals(streamType).toArray(),
        ]);

        if (!active) return;

        const streamList = rawStreams as unknown as BaseStreamItem[];
        const counts = new Map<string, number>();
        const maxScoreByCat = new Map<string, number>();

        for (const item of streamList) {
          const cid = String(item.category_id || '');
          if (!cid) continue;
          counts.set(cid, (counts.get(cid) || 0) + 1);
          const s = getSortScore(item);
          if (s > (maxScoreByCat.get(cid) || 0)) {
            maxScoreByCat.set(cid, s);
          }
        }

        const catList = rawCats
          .map((c) => ({
            id: c.category_id,
            name: cleanCategoryName(c.category_name) || c.category_name,
            count: counts.get(c.category_id) || 0,
          }))
          .filter((c) => c.count > 0)
          .sort((a, b) => {
            if (streamType === 'live') {
              return a.name.localeCompare(b.name, 'pt-BR');
            }
            const scoreDiff = (maxScoreByCat.get(b.id) || 0) - (maxScoreByCat.get(a.id) || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return a.name.localeCompare(b.name, 'pt-BR');
          });

        setItems(streamList);
        setCategories(catList);
        if (streamType === 'live' && streamList.length > 0) {
          setFocusedItem(streamList[0]);
        }
      } catch (err) {
        console.error('Erro ao carregar catálogo TV:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [streamType]);

  const filteredCategories = useMemo(() => {
    const q = normalize(catFilter);
    if (!q) return categories;
    return categories.filter((c) => normalize(c.name).includes(q));
  }, [categories, catFilter]);

  const filteredItems = useMemo(() => {
    const q = normalize(titleFilter);

    const list = items.filter((item) => {
      if (selectedCat === '__favorites__') {
        if (!isFavorite(item.stream_id, item.stream_type)) return false;
      } else if (selectedCat === '__recent__') {
        // Mantém itens com algum score de novidade ou adicionados recentemente
      } else if (selectedCat !== 'all') {
        if (String(item.category_id) !== selectedCat) return false;
      }

      if (q) {
        const text = normalize(`${item.title || ''} ${item.name || ''}`);
        if (!text.includes(q)) return false;
      }

      if (quickFilter === '4k') {
        const text = `${item.title || ''} ${item.name || ''} ${item.category_name || ''}`;
        if (!/\b(4k|uhd|2160p)\b/i.test(text)) return false;
      } else if (quickFilter === 'dubbed') {
        const text = `${item.title || ''} ${item.name || ''}`;
        if (/\[\s*l\s*\]|\(\s*l\s*\)|\[\s*leg\s*\]|\(\s*leg\s*\)|\blegendado\b/i.test(text)) {
          return false;
        }
      } else if (quickFilter === 'unwatched' && streamType !== 'live') {
        if (isWatched(item.stream_id, item.stream_type)) return false;
      }

      return true;
    });

    if (sortBy === 'alpha') {
      list.sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name, 'pt-BR'));
    } else if (sortBy === 'rating') {
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else {
      list.sort((a, b) => getSortScore(b) - getSortScore(a));
    }

    if (selectedCat === '__recent__') {
      return list.slice(0, 100);
    }

    return list;
  }, [items, selectedCat, titleFilter, quickFilter, sortBy, streamType, isFavorite, isWatched]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleLimit);
  }, [filteredItems, visibleLimit]);

  const activeCategoryName = useMemo(() => {
    if (selectedCat === 'all') return 'Todas as Categorias';
    if (selectedCat === '__recent__') return 'Recém-Adicionados';
    if (selectedCat === '__favorites__') return 'Favoritos desta Seção';
    return categories.find((c) => c.id === selectedCat)?.name || 'Categoria';
  }, [selectedCat, categories]);

  const handleSelectCategory = (catId: string) => {
    setSelectedCat(catId);
    setVisibleLimit(BATCH_SIZE);
    setMobileCatsOpen(false);
  };

  const TypeIcon = streamType === 'live' ? Tv : streamType === 'series' ? Video : Film;
  const previewChannel = streamType === 'live' ? focusedItem || visibleItems[0] || null : null;
  const previewFavorited = previewChannel
    ? isFavorite(previewChannel.stream_id, previewChannel.stream_type)
    : false;

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
      {/* SIDEBAR DEDICADA DE CATEGORIAS */}
      <aside
        data-tv-zone="categories"
        className={`lg:w-72 xl:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-[#0b0c13]/95 flex flex-col ${
          mobileCatsOpen ? 'block' : 'hidden lg:flex'
        } lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]`}
      >
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <h2 className="text-xs font-black uppercase tracking-wider text-neutral-200">
                Categorias ({categories.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setMobileCatsOpen(false)}
              className="lg:hidden p-1 rounded-lg text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              data-tv-focusable="true"
              data-tv-focus="input"
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              placeholder="Filtrar categoria..."
              className="w-full bg-[#131420] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-neutral-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1 max-h-[45vh] lg:max-h-none tv-scroll-col">
          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="pill"
            onClick={() => handleSelectCategory('all')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedCat === 'all'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="truncate">Todas</span>
            <span className="text-[10px] font-mono opacity-80">{items.length}</span>
          </button>

          {streamType !== 'live' && (
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              onClick={() => handleSelectCategory('__recent__')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedCat === '__recent__'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                  : 'text-neutral-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Recém-Adicionados
              </span>
              <span className="text-[10px] font-mono opacity-80">Top 100</span>
            </button>
          )}

          <button
            type="button"
            tabIndex={0}
            data-tv-focusable="true"
            data-tv-focus="pill"
            onClick={() => handleSelectCategory('__favorites__')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              selectedCat === '__favorites__'
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2 truncate">
              <Heart className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              Favoritos
            </span>
          </button>

          <div className="my-2 border-t border-white/10" />

          {filteredCategories.map((cat) => {
            const isSelected = selectedCat === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="pill"
                onClick={() => handleSelectCategory(cat.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left cursor-pointer ${
                  isSelected
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                    : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="truncate">{cat.name}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
                  }`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* PAINEL DIREITO: FILTROS + PREVIEW + GRADE */}
      <div className="flex-1 min-w-0 p-5 sm:p-7 space-y-6" data-tv-zone="content">
        {/* Cabeçalho da Seção */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
              <TypeIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {title}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-600/20 text-violet-300 border border-violet-500/30">
                  {filteredItems.length}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                {activeCategoryName} • {subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botão abrir categorias em telas menores que lg */}
            <button
              type="button"
              onClick={() => setMobileCatsOpen((prev) => !prev)}
              data-tv-focusable="true"
              data-tv-focus="button"
              className="lg:hidden px-3.5 py-2 rounded-xl bg-violet-600/20 border border-violet-500/40 text-violet-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>Categorias</span>
            </button>

            {/* Input rápido de filtro dentro da categoria */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                data-tv-focusable="true"
                data-tv-focus="input"
                value={titleFilter}
                onChange={(e) => {
                  setTitleFilter(e.target.value);
                  setVisibleLimit(BATCH_SIZE);
                }}
                placeholder="Filtrar nesta lista..."
                className="w-44 sm:w-56 bg-[#131420] border border-white/15 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-neutral-500"
              />
            </div>

            {/* Ordenação */}
            <button
              type="button"
              tabIndex={0}
              data-tv-focusable="true"
              data-tv-focus="pill"
              onClick={() =>
                setSortBy((prev) =>
                  prev === 'recent' ? 'alpha' : prev === 'alpha' ? 'rating' : 'recent'
                )
              }
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-neutral-200 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />
              <span>
                {sortBy === 'recent' ? 'Novidades' : sortBy === 'alpha' ? 'A - Z' : 'Nota'}
              </span>
            </button>
          </div>
        </div>

        {/* Chips de Filtro Rápido */}
        {streamType !== 'live' && (
          <div className="flex flex-wrap items-center gap-2" data-tv-row="true">
            {[
              { id: 'all', label: 'Todos' },
              { id: '4k', label: '4K / UHD' },
              { id: 'dubbed', label: 'Dublados' },
              { id: 'unwatched', label: 'Não Assistidos' },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="pill"
                onClick={() => {
                  setQuickFilter(chip.id as typeof quickFilter);
                  setVisibleLimit(BATCH_SIZE);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                  quickFilter === chip.id
                    ? 'bg-violet-600 text-white border-violet-400 shadow-md shadow-violet-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-neutral-300 border-white/10'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {/* Painel de Zap Rápido para TV Ao Vivo */}
        {streamType === 'live' && previewChannel && (
          <div className="rounded-3xl bg-[#11121c] border border-white/10 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl relative overflow-hidden">
            <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
              <div className="relative w-28 aspect-video rounded-2xl bg-black border border-white/10 overflow-hidden flex items-center justify-center p-2 shrink-0">
                <ImageWithFallback
                  src={previewChannel.stream_icon}
                  alt={previewChannel.title || previewChannel.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    AO VIVO
                  </span>
                  <span className="text-xs text-neutral-400 truncate">
                    {cleanCategoryName(previewChannel.category_name || '') || 'Canal'}
                  </span>
                </div>
                <h2 className="text-base sm:text-lg font-black text-white truncate mt-1">
                  {previewChannel.title || previewChannel.name}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
              <button
                type="button"
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                onClick={() => {
                  if (previewFavorited) {
                    removeFavorite(previewChannel.stream_id, previewChannel.stream_type);
                  } else {
                    addFavorite({
                      streamId: previewChannel.stream_id,
                      streamType: previewChannel.stream_type,
                      title: previewChannel.title || previewChannel.name,
                      posterUrl: previewChannel.stream_icon,
                      categoryName: previewChannel.category_name,
                    });
                  }
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                  previewFavorited
                    ? 'bg-rose-600/25 border-rose-500/40 text-rose-200'
                    : 'bg-white/5 hover:bg-white/15 border-white/10 text-neutral-200'
                }`}
              >
                <Heart className={`w-4 h-4 ${previewFavorited ? 'fill-rose-500 text-rose-400' : ''}`} />
                <span>{previewFavorited ? 'Favorito' : 'Favoritar'}</span>
              </button>

              <Link
                href={getTvWatchUrl(previewChannel.stream_type, previewChannel.stream_id)}
                tabIndex={0}
                data-tv-focusable="true"
                data-tv-focus="button"
                className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-600/35"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Assistir Agora</span>
              </Link>
            </div>
          </div>
        )}

        {/* Grade de Mídias */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-neutral-400">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs">Carregando catálogo...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#12131c] border border-white/10 text-center space-y-4 max-w-lg mx-auto">
            <p className="text-sm text-neutral-300 font-semibold">
              Nenhum conteúdo sincronizado no dispositivo.
            </p>
            <Link
              href="/tv/settings"
              data-tv-focusable="true"
              data-tv-focus="button"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold"
            >
              <RotateCw className="w-4 h-4" />
              <span>Ir para Configurações e Sincronizar</span>
            </Link>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="p-12 rounded-3xl bg-[#12131c] border border-white/10 text-center space-y-3">
            <SlidersHorizontal className="w-8 h-8 text-neutral-500 mx-auto" />
            <p className="text-sm font-bold text-neutral-300">
              Nenhum título encontrado com os filtros atuais.
            </p>
            <button
              type="button"
              data-tv-focusable="true"
              data-tv-focus="button"
              onClick={() => {
                setSelectedCat('all');
                setTitleFilter('');
                setQuickFilter('all');
              }}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white cursor-pointer"
            >
              Limpar Filtros
            </button>
          </div>
        ) : (
          <>
            <div
              className={
                streamType === 'live'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4'
                  : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'
              }
            >
              {visibleItems.map((item, idx) => (
                <TvMediaCard
                  key={`${item.stream_type}_${item.stream_id}`}
                  autoFocus={idx === 0}
                  onFocusItem={setFocusedItem}
                  isNew={streamType !== 'live' && (idx < 6 || isRecentlyAdded(item))}
                  item={item}
                />
              ))}
            </div>

            {visibleItems.length < filteredItems.length && (
              <div className="pt-4 flex justify-center">
                <button
                  type="button"
                  tabIndex={0}
                  data-tv-focusable="true"
                  data-tv-focus="button"
                  onClick={() => setVisibleLimit((prev) => prev + BATCH_SIZE)}
                  className="px-6 py-3 rounded-2xl bg-violet-600/20 hover:bg-violet-600 border border-violet-500/40 text-violet-200 hover:text-white text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Carregar mais ({filteredItems.length - visibleItems.length} restantes)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
