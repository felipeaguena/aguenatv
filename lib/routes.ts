import { StreamType } from './types';

export function getRouteType(streamType: StreamType | string): 'series' | 'movies' | 'live' {
  if (streamType === 'series') return 'series';
  if (streamType === 'movie' || streamType === 'movies') return 'movies';
  return 'live';
}

export function getWatchUrl(
  streamType: StreamType | string,
  id: string | number,
  episodeId?: string | number,
  season?: string | number
): string {
  const routeType = getRouteType(streamType);
  const params = new URLSearchParams();
  if (episodeId) params.set('ep', String(episodeId));
  if (season) params.set('season', String(season));
  const queryString = params.toString() ? `?${params.toString()}` : '';
  return `/${routeType}/${id}/watch${queryString}`;
}

export function getInfoUrl(
  streamType: StreamType | string,
  id: string | number
): string {
  const routeType = getRouteType(streamType);
  return `/${routeType}/${id}/info`;
}
