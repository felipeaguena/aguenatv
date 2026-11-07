'use client';

import { use, useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Sparkles,
  Film,
  Tv,
  Play,
  Star,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Users,
  Layers,
  Heart,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { localDB } from '@/lib/db-local';
import { BaseStreamItem, PersonDetails, PersonCredit, StreamType } from '@/lib/types';
import { normalizeSearchText } from '@/lib/search-index';
import { getInfoUrl, getWatchUrl } from '@/lib/routes';
import MediaCard from '@/components/media/MediaCard';
import ImageWithFallback from '@/components/ui/ImageWithFallback';

interface PersonPageProps {
  params: Promise<{ id: string }>;
}

export default function PersonPage({ params }: PersonPageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const nameParam = searchParams.get('name') || '';

  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-neutral-400 font-medium">Carregando informações do artista...</p>
        </div>
      }
    >
      <PersonView id={id} initialName={nameParam} />
    </Suspense>
  );
}

function PersonView({ id, initialName }: { id: string; initialName: string }) {
  const router = useRouter();

  const [person, setPerson] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de catálogo disponível localmente
  const [catalogMatches, setCatalogMatches] = useState<
    Array<{ stream: BaseStreamItem; credit?: PersonCredit }>
  >([]);
  const [matchingCatalog, setMatchingCatalog] = useState(true);
  const [catalogTab, setCatalogTab] = useState<'all' | 'movie' | 'series'>('all');

  // Estados da filmografia completa do TMDb
  const [filmographyFilter, setFilmographyFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [bioExpanded, setBioExpanded] = useState(false);

  // 1. Carrega dados do artista via TMDb API route (/api/person)
  useEffect(() => {
    let isMounted = true;
    async function loadPersonData() {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        if (id && /^\d+$/.test(id)) {
          queryParams.set('id', id);
        }
        if (initialName) {
          queryParams.set('name', initialName);
        } else if (id && !/^\d+$/.test(id)) {
          queryParams.set('name', decodeURIComponent(id));
        }

        const res = await fetch(`/api/person?${queryParams.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Não foi possível carregar as informações do artista');
        }

        const data: PersonDetails = await res.json();
        if (isMounted) {
          setPerson(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Erro ao consultar detalhes do artista');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadPersonData();
    return () => {
      isMounted = false;
    };
  }, [id, initialName]);

  // 2. Cruzamento inteligente com o banco de itens disponíveis no IPTV (IndexedDB)
  useEffect(() => {
    if (!person || !localDB) {
      setMatchingCatalog(false);
      return;
    }

    let isMounted = true;

    async function matchCatalog() {
      setMatchingCatalog(true);
      try {
        // Carrega filmes e séries disponíveis no catálogo local
        const [movies, series] = await Promise.all([
          localDB.streams.where('stream_type').equals('movie').toArray(),
          localDB.streams.where('stream_type').equals('series').toArray(),
        ]);
        const streams = [...movies, ...series];

        if (!streams || streams.length === 0) {
          if (isMounted) {
            setCatalogMatches([]);
            setMatchingCatalog(false);
          }
          return;
        }

        const normActorName = normalizeSearchText(person!.name);

        // Prepara catálogo com títulos normalizados e sem anos
        const preparedCatalog = streams.map((s) => {
          const raw = s.title || s.name || '';
          const norm = normalizeSearchText(raw);
          const clean = norm.replace(/\b(19\d\d|20\d\d)\b/g, '').trim();
          const main = clean.split(/[:–—]| - /)[0].trim();
          const normCat = normalizeSearchText(s.category_name || '');
          return {
            stream: s,
            norm,
            clean,
            main,
            normCat,
            streamType: s.stream_type,
          };
        });

        const seenStreamIds = new Set<string>();
        const matched: Array<{ stream: BaseStreamItem; credit?: PersonCredit }> = [];

        // A. Cruzamento via filmografia do TMDb (títulos em português e originais)
        for (const credit of person!.credits) {
          const targetType: StreamType = credit.media_type === 'tv' ? 'series' : 'movie';
          const creditTitleNorm = normalizeSearchText(credit.title)
            .replace(/\b(19\d\d|20\d\d)\b/g, '')
            .trim();
          const origTitleNorm = credit.original_title
            ? normalizeSearchText(credit.original_title)
                .replace(/\b(19\d\d|20\d\d)\b/g, '')
                .trim()
            : null;

          const creditMain = creditTitleNorm.split(/[:–—]| - /)[0].trim();
          const origMain = origTitleNorm ? origTitleNorm.split(/[:–—]| - /)[0].trim() : null;

          for (const item of preparedCatalog) {
            const streamKey = `${item.streamType}_${item.stream.stream_id}`;
            if (seenStreamIds.has(streamKey)) continue;

            // Compatibilidade de tipo (filme ou série)
            if (item.streamType !== targetType) continue;

            let isMatch = false;

            // 1. Título idêntico (limpo ou principal)
            if (
              item.clean === creditTitleNorm ||
              item.main === creditTitleNorm ||
              (origTitleNorm && (item.clean === origTitleNorm || item.main === origTitleNorm))
            ) {
              isMatch = true;
            }

            // 2. Título do catálogo começa com o título da produção (mín 4 chars)
            if (!isMatch && creditTitleNorm.length >= 4) {
              if (item.clean.startsWith(creditTitleNorm) || item.main.startsWith(creditTitleNorm)) {
                isMatch = true;
              }
            }

            if (!isMatch && origTitleNorm && origTitleNorm.length >= 4) {
              if (item.clean.startsWith(origTitleNorm) || item.main.startsWith(origTitleNorm)) {
                isMatch = true;
              }
            }

            // 3. Título principal delimitado antes de dois-pontos ou hífen
            if (!isMatch && creditMain.length >= 4) {
              if (item.clean === creditMain || item.main === creditMain) {
                isMatch = true;
              }
            }

            if (!isMatch && origMain && origMain.length >= 4) {
              if (item.clean === origMain || item.main === origMain) {
                isMatch = true;
              }
            }

            if (isMatch) {
              seenStreamIds.add(streamKey);
              matched.push({
                stream: item.stream,
                credit,
              });
            }
          }
        }

        // B. Bonus: Verifica se o artista é citado explicitamente na categoria (ex: "ESPECIAL TOM CRUISE")
        if (normActorName.length >= 4) {
          for (const item of preparedCatalog) {
            const streamKey = `${item.streamType}_${item.stream.stream_id}`;
            if (seenStreamIds.has(streamKey)) continue;

            if (item.normCat.includes(normActorName) || item.norm.includes(normActorName)) {
              seenStreamIds.add(streamKey);
              matched.push({
                stream: item.stream,
              });
            }
          }
        }

        if (isMounted) {
          setCatalogMatches(matched);
        }
      } catch (err) {
        console.warn('[PersonView] Erro ao cruzar catálogo local:', err);
      } finally {
        if (isMounted) setMatchingCatalog(false);
      }
    }

    matchCatalog();
    return () => {
      isMounted = false;
    };
  }, [person]);

  // Cálculo de idade e datas formatadas
  const ageInfo = useMemo(() => {
    if (!person?.birthday) return null;
    try {
      const birth = new Date(person.birthday);
      const end = person.deathday ? new Date(person.deathday) : new Date();
      let age = end.getFullYear() - birth.getFullYear();
      const m = end.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) {
        age--;
      }

      const birthFormatted = birth.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      if (person.deathday) {
        return `${birthFormatted} (Faleceu aos ${age} anos)`;
      }
      return `${birthFormatted} (${age} anos)`;
    } catch {
      return person.birthday;
    }
  }, [person?.birthday, person?.deathday]);

  // Itens disponíveis no catálogo filtrados por aba (Todos, Filmes, Séries)
  const filteredCatalogItems = useMemo(() => {
    if (catalogTab === 'all') return catalogMatches;
    return catalogMatches.filter((m) => m.stream.stream_type === catalogTab);
  }, [catalogMatches, catalogTab]);

  const movieCountInCatalog = useMemo(
    () => catalogMatches.filter((m) => m.stream.stream_type === 'movie').length,
    [catalogMatches]
  );
  const seriesCountInCatalog = useMemo(
    () => catalogMatches.filter((m) => m.stream.stream_type === 'series').length,
    [catalogMatches]
  );

  // Mapa rápido de IDs de TMDb que estão disponíveis no catálogo
  const matchedTmdbIds = useMemo(() => {
    const set = new Set<number>();
    for (const m of catalogMatches) {
      if (m.credit?.id) set.add(m.credit.id);
    }
    return set;
  }, [catalogMatches]);

  // Filmografia completa do TMDb filtrada
  const filteredFilmography = useMemo(() => {
    if (!person?.credits) return [];
    if (filmographyFilter === 'all') return person.credits;
    return person.credits.filter((c) => c.media_type === filmographyFilter);
  }, [person?.credits, filmographyFilter]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white/5" />
          <div className="h-6 w-48 bg-white/5 rounded-lg" />
        </div>
        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
          <div className="w-44 h-60 rounded-3xl bg-white/5 shrink-0" />
          <div className="flex-1 space-y-4 w-full">
            <div className="h-10 w-3/4 bg-white/5 rounded-xl" />
            <div className="flex gap-2">
              <div className="h-6 w-24 bg-white/5 rounded-full" />
              <div className="h-6 w-32 bg-white/5 rounded-full" />
            </div>
            <div className="h-24 w-full bg-white/5 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">Artista não encontrado</h1>
          <p className="text-sm text-neutral-400">
            {error || 'Não encontramos detalhes para este membro do elenco no momento.'}
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para a página anterior
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0e15] text-neutral-100 pb-20 space-y-10">
      {/* 1. Barra de Navegação Superior / Breadcrumb */}
      <div className="border-b border-white/5 bg-[#10111a]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-xs font-semibold text-neutral-300 hover:text-white transition px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span>Elenco</span>
            <span className="text-neutral-600">/</span>
            <span className="text-violet-300 font-semibold truncate max-w-[200px] sm:max-w-xs">
              {person.name}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* 2. Seção Hero / Perfil do Artista */}
        <section className="relative overflow-hidden rounded-3xl bg-[#13141b] border border-white/5 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-6 sm:gap-8 items-center md:items-start relative z-10">
            {/* Foto do Artista */}
            <div className="relative group shrink-0">
              <div className="w-40 h-56 sm:w-52 sm:h-72 rounded-2xl overflow-hidden bg-neutral-900 border-2 border-white/10 shadow-2xl">
                {person.profile_url ? (
                  <img
                    src={person.profile_url}
                    alt={person.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-neutral-600 gap-2">
                    <Users className="w-12 h-12" />
                    <span className="text-xs font-bold uppercase">{person.name.slice(0, 2)}</span>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-600 text-white shadow-lg border border-violet-400/30">
                {person.known_for_department}
              </div>
            </div>

            {/* Informações e Biografia */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                  {person.name}
                </h1>

                {/* Badges de Metadados */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
                  {ageInfo && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-neutral-300">
                      <Calendar className="w-3.5 h-3.5 text-violet-400" />
                      {ageInfo}
                    </span>
                  )}

                  {person.place_of_birth && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-neutral-300">
                      <MapPin className="w-3.5 h-3.5 text-violet-400" />
                      {person.place_of_birth}
                    </span>
                  )}

                  {person.gender && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-neutral-300">
                      {person.gender}
                    </span>
                  )}

                  {/* Badge de títulos no app */}
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    <Play className="w-3 h-3 fill-current" />
                    {catalogMatches.length}{' '}
                    {catalogMatches.length === 1 ? 'disponível no app' : 'disponíveis no app'}
                  </span>
                </div>
              </div>

              {/* Biografia */}
              {person.biography && (
                <div className="space-y-2 text-sm text-neutral-300 leading-relaxed max-w-4xl">
                  <p
                    className={`${
                      !bioExpanded ? 'line-clamp-3 sm:line-clamp-4' : ''
                    } transition-all`}
                  >
                    {person.biography}
                  </p>
                  {person.biography.length > 250 && (
                    <button
                      onClick={() => setBioExpanded(!bioExpanded)}
                      className="text-xs font-bold text-violet-400 hover:text-violet-300 inline-flex items-center gap-1 pt-1 transition cursor-pointer"
                    >
                      <span>{bioExpanded ? 'Mostrar Menos' : 'Ler Biografia Completa'}</span>
                      {bioExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. Seção Principal: Disponíveis para Assistir no App (Nosso Banco de Itens) */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                    Disponível no seu Catálogo
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {catalogMatches.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  Filmes e séries com a participação de {person.name} prontos para reprodução imediata
                </p>
              </div>
            </div>

            {/* Abas de Filtro: Todos, Filmes, Séries */}
            {catalogMatches.length > 0 && (
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#13141b] border border-white/5 self-start sm:self-auto">
                <button
                  onClick={() => setCatalogTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    catalogTab === 'all'
                      ? 'bg-violet-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Todos ({catalogMatches.length})
                </button>
                <button
                  onClick={() => setCatalogTab('movie')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    catalogTab === 'movie'
                      ? 'bg-violet-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Filmes ({movieCountInCatalog})
                </button>
                <button
                  onClick={() => setCatalogTab('series')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    catalogTab === 'series'
                      ? 'bg-violet-600 text-white shadow'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Séries ({seriesCountInCatalog})
                </button>
              </div>
            )}
          </div>

          {matchingCatalog ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="aspect-[2/3] rounded-2xl bg-white/5 animate-pulse border border-white/5"
                />
              ))}
            </div>
          ) : catalogMatches.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#13141b] border border-white/5 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-neutral-500 mx-auto" />
              <p className="text-sm font-semibold text-neutral-300">
                Nenhum título deste artista encontrado no seu catálogo de streaming no momento.
              </p>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Você pode conferir toda a filmografia oficial abaixo para conhecer os trabalhos do
                artista.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredCatalogItems.map(({ stream, credit }) => (
                <div key={`${stream.stream_type}_${stream.stream_id}`} className="space-y-1.5">
                  <MediaCard item={stream} />
                  {credit?.character && (
                    <p className="text-[11px] text-neutral-400 truncate px-1 font-medium">
                      como <span className="text-violet-300">{credit.character}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. Seção Secundária: Filmografia Completa (TMDb) */}
        <section className="space-y-5 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Filmografia Completa
                </h2>
                <p className="text-xs text-neutral-400">
                  Todas as produções registradas ({person.credits.length} títulos no TMDb)
                </p>
              </div>
            </div>

            {/* Filtro TMDb: Todas, Filmes, Séries */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#13141b] border border-white/5 self-start sm:self-auto">
              <button
                onClick={() => setFilmographyFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filmographyFilter === 'all'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Todas ({person.credits.length})
              </button>
              <button
                onClick={() => setFilmographyFilter('movie')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filmographyFilter === 'movie'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Filmes ({person.credits.filter((c) => c.media_type === 'movie').length})
              </button>
              <button
                onClick={() => setFilmographyFilter('tv')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filmographyFilter === 'tv'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Séries ({person.credits.filter((c) => c.media_type === 'tv').length})
              </button>
            </div>
          </div>

          {/* Grid de Produções do TMDb */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFilmography.map((credit, idx) => {
              const isInCatalog = matchedTmdbIds.has(credit.id);
              const matchedStream = catalogMatches.find((m) => m.credit?.id === credit.id)?.stream;

              return (
                <div
                  key={`credit_${credit.media_type}_${credit.id}_${idx}`}
                  onClick={() => {
                    if (matchedStream) {
                      router.push(getInfoUrl(matchedStream.stream_type, matchedStream.stream_id));
                    }
                  }}
                  className={`group rounded-2xl bg-[#13141b] border transition-all p-2 flex flex-col space-y-2 ${
                    matchedStream
                      ? 'border-emerald-500/30 hover:border-emerald-500 hover:shadow-[0_8px_24px_rgba(16,185,129,0.18)] cursor-pointer'
                      : 'border-white/5 opacity-80 hover:opacity-100 hover:border-white/20'
                  }`}
                >
                  {/* Poster */}
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-neutral-900 border border-white/5">
                    {credit.poster_url ? (
                      <img
                        src={credit.poster_url}
                        alt={credit.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 p-2 text-center text-xs">
                        {credit.title}
                      </div>
                    )}

                    {/* Tag de Mídia (Filme ou Série) */}
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/70 backdrop-blur-sm text-neutral-300 border border-white/10">
                      {credit.media_type === 'tv' ? 'Série' : 'Filme'}
                    </span>

                    {/* Tag de Disponível no App */}
                    {isInCatalog && (
                      <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white shadow flex items-center gap-1">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        No App
                      </span>
                    )}

                    {/* Nota */}
                    {credit.vote_average && credit.vote_average > 0 ? (
                      <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-black/75 backdrop-blur-sm text-amber-400 flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {credit.vote_average}
                      </span>
                    ) : null}
                  </div>

                  {/* Informações de Título e Personagem */}
                  <div className="flex-1 flex flex-col justify-between space-y-1">
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-violet-300 transition-colors line-clamp-1">
                        {credit.title}
                      </h3>
                      {credit.character && (
                        <p className="text-[10px] text-neutral-400 line-clamp-1">
                          como {credit.character}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1">
                      <span>{credit.year || '—'}</span>
                      {isInCatalog && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          Assistir &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
