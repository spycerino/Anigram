import { fetchMediaWithSchedule, displayTitle } from "../anilist/seasonShows.js";
import { watchingRepo } from "../db/repos/watching.js";
import { episodesRepo } from "../db/repos/episodes.js";
import { seasonForDate } from "../anilist/season.js";

// Pulls the show's airing schedule from AniList and seeds the episodes table
// for this group. Idempotent: re-running upserts aired_at for each episode.
export async function seedShowForGroup(groupId: number, mediaId: number): Promise<string> {
  const media = await fetchMediaWithSchedule(mediaId);
  const title = displayTitle(media.title);
  const { season, year } = seasonForDate();
  watchingRepo.add(groupId, media.id, title, season, year);

  for (const ep of media.airingSchedule.nodes) {
    episodesRepo.upsert(groupId, media.id, ep.episode, ep.airingAt);
  }
  if (media.nextAiringEpisode) {
    episodesRepo.upsert(
      groupId,
      media.id,
      media.nextAiringEpisode.episode,
      media.nextAiringEpisode.airingAt
    );
  }
  return title;
}

// Refreshes airing times for all currently-airing shows.
export async function refreshAiringShows(): Promise<void> {
  const rows = watchingRepo.listAiring();
  const byMedia = new Map<number, number[]>();
  for (const w of rows) {
    const arr = byMedia.get(w.media_id) ?? [];
    arr.push(w.group_id);
    byMedia.set(w.media_id, arr);
  }
  for (const [mediaId, groupIds] of byMedia) {
    try {
      const media = await fetchMediaWithSchedule(mediaId);
      for (const groupId of groupIds) {
        for (const ep of media.airingSchedule.nodes) {
          episodesRepo.upsert(groupId, mediaId, ep.episode, ep.airingAt);
        }
        if (media.nextAiringEpisode) {
          episodesRepo.upsert(groupId, mediaId, media.nextAiringEpisode.episode, media.nextAiringEpisode.airingAt);
        }
        if (!media.nextAiringEpisode && media.status && media.status !== "RELEASING") {
          watchingRepo.setStatus(groupId, mediaId, "finished");
        }
      }
    } catch (err) {
      console.error(`refresh failed for media ${mediaId}:`, err);
    }
  }
}
