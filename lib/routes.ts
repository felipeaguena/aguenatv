import { StreamType } from './types';

export function getRouteType(streamType: StreamType | string): 'series' | 'movies' | 'live' {
  if (streamType === 'series') return 'series';
  if (streamType === 'movie' || streamType === 'movies') return 'movies';
  return 'live';
}

export function getWatchUrl(
  streamType: StreamType | string,
  id: string | number,
  episodeId?: string | number
): string {
  const routeType = getRouteType(streamType);
  const epQuery = episodeId ? `?ep=${episodeId}` : '';
  return `/${routeType}/${id}/watch${epQuery}`;
}

export function getInfoUrl(
  streamType: StreamType | string,
  id: string | number
): string {
  const routeType = getRouteType(streamType);
  return `/${routeType}/${id}/info`;
}
