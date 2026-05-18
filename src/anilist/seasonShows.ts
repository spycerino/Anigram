import { anilistRequest } from "./client.js";
import { TtlCache } from "./cache.js";
import { SEASON_SHOWS, MEDIA_WITH_SCHEDULE, SEARCH_MEDIA } from "./queries.js";
import { seasonForDate, type Season } from "./season.js";

export interface SeasonMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  episodes: number | null;
  format: string | null;
  status: string | null;
  coverImage: { medium: string | null };
  siteUrl: string;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

interface SeasonShowsResp {
  Page: { pageInfo: { hasNextPage: boolean; currentPage: number }; media: SeasonMedia[] };
}

const seasonCache = new TtlCache<string, SeasonMedia[]>(60 * 60 * 1000);

export async function fetchCurrentSeason(): Promise<SeasonMedia[]> {
  const { season, year } = seasonForDate();
  const key = `${season}:${year}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;

  const all: SeasonMedia[] = [];
  let page = 1;
  while (page <= 5) {
    const resp = await anilistRequest<SeasonShowsResp>(SEASON_SHOWS, {
      season,
      year,
      page,
      perPage: 50,
    });
    all.push(...resp.Page.media);
    if (!resp.Page.pageInfo.hasNextPage) break;
    page += 1;
  }
  seasonCache.set(key, all);
  return all;
}

export interface MediaWithSchedule {
  id: number;
  title: { romaji: string | null; english: string | null };
  status: string | null;
  episodes: number | null;
  airingSchedule: { nodes: { episode: number; airingAt: number }[] };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

export async function fetchMediaWithSchedule(id: number): Promise<MediaWithSchedule> {
  const resp = await anilistRequest<{ Media: MediaWithSchedule }>(MEDIA_WITH_SCHEDULE, { id });
  return resp.Media;
}

export interface SearchHit {
  id: number;
  title: { romaji: string | null; english: string | null };
}

export async function searchMediaInCurrentSeason(query: string): Promise<SearchHit[]> {
  const { season, year } = seasonForDate();
  const resp = await anilistRequest<{ Page: { media: SearchHit[] } }>(SEARCH_MEDIA, {
    search: query,
    season,
    year,
  });
  return resp.Page.media;
}

export function displayTitle(t: { romaji: string | null; english: string | null }): string {
  return t.english || t.romaji || "Unknown";
}

export type { Season };
