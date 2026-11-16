import { StreamType } from './types';
import { getRouteType } from './routes';

export function getTvHomeUrl(): string {
  return '/tv';
}

export function getTvInfoUrl(
  streamType: StreamType | string,
  id: string | number
): string {
  const routeType = getRouteType(streamType);
  return `/tv/info/${routeType}/${id}`;
}

export function getTvWatchUrl(
  streamType: StreamType | string,
  id: string | number,
  episodeId?: string | number,
  season?: string | number,
  startTimeSeconds?: number
): string {
  const routeType = getRouteType(streamType);
  const params = new URLSearchParams();
  if (episodeId) params.set('ep', String(episodeId));
  if (season) params.set('season', String(season));
  if (startTimeSeconds && startTimeSeconds > 0) {
    params.set('t', String(Math.floor(startTimeSeconds)));
  }
  const qs = params.toString() ? `?${params.toString()}` : '';
  return `/tv/watch/${routeType}/${id}${qs}`;
}

export function getTvSearchUrl(query?: string): string {
  if (!query || !query.trim()) return '/tv/search';
  return `/tv/search?q=${encodeURIComponent(query.trim())}`;
}

export function getTvCatalogUrl(
  streamType: StreamType | string,
  categoryId?: string
): string {
  const routeType = getRouteType(streamType);
  const base =
    routeType === 'series'
      ? '/tv/series'
      : routeType === 'movies'
      ? '/tv/movies'
      : '/tv/live';
  if (categoryId && categoryId !== 'all') {
    return `${base}?cat=${encodeURIComponent(categoryId)}`;
  }
  return base;
}
