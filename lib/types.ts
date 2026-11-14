export type UserRole = 'admin' | 'user';

export interface AppUser {
  id: string;
  username: string;
  password_hash?: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface SessionUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export type StreamType = 'live' | 'movie' | 'series';

export interface BaseStreamItem {
  id?: string | number;
  stream_id: string;
  name: string;
  title: string;
  stream_type: StreamType;
  stream_icon?: string;
  category_id?: string;
  category_name?: string;
  rating?: string | number;
  added?: string;
  container_extension?: string;
}

export interface Category {
  category_id: string;
  category_name: string;
  parent_id?: number;
}

export interface FavoriteItem {
  id: string;
  user_id: string;
  stream_id: string;
  stream_type: StreamType;
  title: string;
  poster_url?: string;
  category_name?: string;
  rating?: string;
  created_at: string;
}

export interface WatchedItem {
  id: string;
  user_id: string;
  stream_id: string;
  stream_type: StreamType;
  title: string;
  poster_url?: string;
  category_name?: string;
  rating?: string;
  progress_seconds: number;
  duration_seconds?: number;
  is_completed: boolean;
  watched_at: string;
}

export interface ContinueWatchingItem {
  id: string;
  user_id?: string;
  stream_id: string;
  stream_type: StreamType;
  title: string;
  poster_url?: string;
  backdrop_url?: string;
  category_name?: string;

  // Detalhes específicos para Séries
  series_id?: string;
  series_title?: string;
  episode_id?: string;
  episode_num?: number | string;
  season_num?: number | string;
  episode_title?: string;

  // Progresso da reprodução
  current_time: number;
  duration: number;
  progress_percentage: number;
  last_watched_at: string;
}

export interface IPTVAccount {
  server_url: string;
  username: string;
  password: string;
}

export interface IPTVPlaylist {
  id: string;
  name: string;
  server_url: string;
  username: string;
  password: string;
  m3u_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_synced?: number;
  channels_count?: number;
  movies_count?: number;
  series_count?: number;
}

export interface SeriesSeason {
  id?: number | string;
  season_number: number;
  name: string;
  episode_count?: number;
  air_date?: string;
  overview?: string;
  cover?: string;
  cover_big?: string;
  vote_average?: number;
}

export interface SeriesEpisodeInfo {
  duration?: string;
  duration_secs?: number;
  plot?: string;
  movie_image?: string;
  cover_big?: string;
  rating?: string | number;
  season?: string | number;
  release_date?: string;
}

export interface SeriesEpisode {
  id: string;
  episode_num: string | number;
  title: string;
  container_extension?: string;
  season: number | string;
  direct_source?: string;
  info?: SeriesEpisodeInfo;
  subtitles?: string[];
  added?: string;
}

export interface SeriesInfoResponse {
  seasons?: SeriesSeason[];
  info?: {
    name?: string;
    title?: string;
    cover?: string;
    plot?: string;
    cast?: string;
    director?: string;
    genre?: string;
    releaseDate?: string;
    rating?: string | number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    episode_run_time?: string;
  };
  episodes?: Record<string, SeriesEpisode[]>;
}

export interface CastMember {
  id?: number | string;
  name: string;
  character?: string;
  profileUrl?: string;
}

export interface PersonCredit {
  id: number;
  title: string;
  original_title?: string;
  media_type: 'movie' | 'tv';
  character?: string;
  job?: string;
  department?: string;
  release_date?: string;
  year?: string;
  poster_url?: string;
  backdrop_url?: string;
  vote_average?: number;
  popularity?: number;
}

export interface PersonDetails {
  id: number;
  name: string;
  biography?: string;
  birthday?: string;
  deathday?: string;
  place_of_birth?: string;
  profile_url?: string;
  known_for_department?: string;
  gender?: string;
  imdb_id?: string;
  credits: PersonCredit[];
}

export interface EnrichedEpisodeMetadata {
  episodeNumber: number;
  name?: string;
  overview?: string;
  airDate?: string;
  thumbnailUrl?: string;
  rating?: number;
}

export interface SeasonOfficialMetadata {
  season: string | number;
  showId?: number;
  showName?: string;
  officialEpisodeCount: number;
  releasedEpisodeCount: number;
  unreleasedEpisodeCount: number;
  showTotalEpisodes?: number;
  showTotalSeasons?: number;
  episodes: Record<string | number, EnrichedEpisodeMetadata>;
}

export interface EnrichedMetadata {
  tmdbId?: number;
  source: 'tmdb' | 'kitsu' | 'tvmaze' | 'tmdb+kitsu' | 'none';
  title?: string;
  titlePortuguese?: string;
  titleEnglish?: string;
  titleRomanized?: string;
  originalTitle?: string;
  aliases?: string[];
  overview?: string;
  backdropUrl?: string;
  posterUrl?: string;
  rating?: number | string;
  genres?: string[];
  releaseDate?: string;
  year?: string;
  status?: string;
  totalEpisodes?: number;
  totalSeasons?: number;
  cast?: CastMember[];
  trailerUrl?: string;
  trailerEmbedUrl?: string;
  ageRating?: string;
}

export interface SkipTimeInterval {
  start: number;
  end: number;
}

export interface SkipTimesData {
  found: boolean;
  source?: 'theintrodb' | 'aniskip' | 'local';
  intro?: SkipTimeInterval | null;
  outro?: SkipTimeInterval | null;
  recap?: SkipTimeInterval | null;
  preview?: SkipTimeInterval | null;
}

