'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

export interface UseUrlPaginationOptions {
  categoryParam?: string;
  pageParam?: string;
  searchParam?: string;
  defaultCategory?: string;
  defaultPage?: number;
  defaultSearch?: string;
}

/**
 * Hook para gerenciar paginação, categorias e busca sincronizados com a URL e com o
 * histórico do navegador (History API).
 *
 * - Permite usar os botões "Voltar" e "Avançar" nativos do navegador entre páginas e categorias.
 * - Ao abrir um card de filme/série e depois voltar, retorna exatamente na mesma página e categoria.
 * - Opera 100% no cliente sem qualquer chamada ao servidor (0 consumo de recursos).
 */
export function useUrlPagination(options?: UseUrlPaginationOptions) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const catKey = options?.categoryParam || 'cat';
  const pageKey = options?.pageParam || 'page';
  const qKey = options?.searchParam || 'q';

  // Leitura inicial dos parâmetros
  const readCategory = useCallback(() => {
    return (
      searchParams.get(catKey) ||
      (catKey === 'cat' ? searchParams.get('category') : null) ||
      options?.defaultCategory ||
      'all'
    );
  }, [searchParams, catKey, options?.defaultCategory]);

  const readPage = useCallback(() => {
    const raw = searchParams.get(pageKey);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return !isNaN(parsed) && parsed > 0 ? parsed : options?.defaultPage || 1;
  }, [searchParams, pageKey, options?.defaultPage]);

  const readSearch = useCallback(() => {
    return searchParams.get(qKey) || options?.defaultSearch || '';
  }, [searchParams, qKey, options?.defaultSearch]);

  const [selectedCat, setSelectedCatState] = useState<string>(readCategory);
  const [currentPage, setCurrentPageState] = useState<number>(readPage);
  const [search, setSearchState] = useState<string>(readSearch);

  const scrollStorageKey = `miruro_scroll_${pathname}`;

  // Atualiza a URL no navegador sem recarregar e sem bater no servidor
  const pushUrlState = useCallback(
    (newCat: string, newPage: number, newSearch: string, replace = false) => {
      if (typeof window === 'undefined') return;

      const sp = new URLSearchParams(window.location.search);

      if (newCat && newCat !== 'all') {
        sp.set(catKey, newCat);
      } else {
        sp.delete(catKey);
        if (catKey === 'cat') sp.delete('category');
      }

      if (newPage > 1) {
        sp.set(pageKey, String(newPage));
      } else {
        sp.delete(pageKey);
      }

      if (newSearch && newSearch.trim()) {
        sp.set(qKey, newSearch.trim());
      } else {
        sp.delete(qKey);
      }

      const queryString = sp.toString();
      const target = queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname;

      // Salva a posição de rolagem atual antes da transição
      try {
        sessionStorage.setItem(scrollStorageKey, String(window.scrollY));
      } catch (e) {}

      if (replace) {
        window.history.replaceState({ cat: newCat, page: newPage, q: newSearch }, '', target);
      } else {
        window.history.pushState({ cat: newCat, page: newPage, q: newSearch }, '', target);
      }
    },
    [catKey, pageKey, qKey, scrollStorageKey]
  );

  // Escuta os botões nativos do navegador "Voltar" e "Avançar" (evento popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const cat =
        sp.get(catKey) ||
        (catKey === 'cat' ? sp.get('category') : null) ||
        options?.defaultCategory ||
        'all';
      const rawPage = sp.get(pageKey);
      const page = rawPage ? parseInt(rawPage, 10) || 1 : options?.defaultPage || 1;
      const q = sp.get(qKey) || options?.defaultSearch || '';

      setSelectedCatState(cat);
      setCurrentPageState(page);
      setSearchState(q);

      // Restaura o scroll anterior se existir
      try {
        const savedScroll = sessionStorage.getItem(scrollStorageKey);
        if (savedScroll) {
          const y = parseInt(savedScroll, 10);
          if (!isNaN(y)) {
            setTimeout(() => {
              window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
            }, 30);
          }
        }
      } catch (e) {}
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [catKey, pageKey, qKey, scrollStorageKey, options?.defaultCategory, options?.defaultPage, options?.defaultSearch]);

  // Sincroniza se a URL mudar via navegação Next.js
  useEffect(() => {
    const cat = readCategory();
    const page = readPage();
    const q = readSearch();

    setSelectedCatState(cat);
    setCurrentPageState(page);
    setSearchState(q);
  }, [readCategory, readPage, readSearch]);

  const setCategory = useCallback(
    (newCat: string) => {
      setSelectedCatState(newCat);
      setCurrentPageState(1);
      pushUrlState(newCat, 1, search, false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [search, pushUrlState]
  );

  const setPage = useCallback(
    (newPage: number) => {
      setCurrentPageState(newPage);
      pushUrlState(selectedCat, newPage, search, false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [selectedCat, search, pushUrlState]
  );

  const setSearch = useCallback(
    (newSearch: string) => {
      setSearchState(newSearch);
      setCurrentPageState(1);
      // ReplaceState enquanto digita para não criar 1 entrada por tecla
      pushUrlState(selectedCat, 1, newSearch, true);
    },
    [selectedCat, pushUrlState]
  );

  return {
    selectedCat,
    currentPage,
    search,
    setCategory,
    setPage,
    setSearch,
  };
}
