export const SEASON_SHOWS = /* GraphQL */ `
  query SeasonShows($season: MediaSeason!, $year: Int!, $page: Int!, $perPage: Int!) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage currentPage }
      media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
        id
        title { romaji english }
        episodes
        format
        status
        coverImage { medium }
        siteUrl
        nextAiringEpisode { episode airingAt }
      }
    }
  }
`;

export const MEDIA_WITH_SCHEDULE = /* GraphQL */ `
  query MediaWithSchedule($id: Int!) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english }
      status
      episodes
      airingSchedule(notYetAired: false, perPage: 100) {
        nodes { episode airingAt }
      }
      nextAiringEpisode { episode airingAt }
    }
  }
`;

export const SEARCH_MEDIA = /* GraphQL */ `
  query SearchMedia($search: String!, $season: MediaSeason, $year: Int) {
    Page(page: 1, perPage: 10) {
      media(search: $search, season: $season, seasonYear: $year, type: ANIME, sort: SEARCH_MATCH) {
        id
        title { romaji english }
      }
    }
  }
`;
