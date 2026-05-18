import { db } from "../db/index.js";
import { watchingRepo } from "../db/repos/watching.js";
import { fetchMediaWithSchedule } from "../anilist/seasonShows.js";
import { seasonForDate } from "../anilist/season.js";
import { refreshAiringShows } from "./watchSeed.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVE_GRACE_DAYS = 14;

const getSetting = db.prepare<[string]>(`SELECT value FROM settings WHERE key = ?`);
const setSetting = db.prepare<[string, string]>(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

function readSeasonKey(): string | undefined {
  const row = getSetting.get("current_season") as { value: string } | undefined;
  return row?.value;
}

function writeSeasonKey(key: string): void {
  setSetting.run("current_season", key);
}

export async function runRollover(): Promise<void> {
  const { season, year } = seasonForDate();
  const currentKey = `${season}:${year}`;
  const last = readSeasonKey();
  if (last === currentKey) return;

  console.log(`Season rollover: ${last ?? "(none)"} -> ${currentKey}`);
  await refreshAiringShows();

  // After refresh, anything still 'airing' carries over. Things that flipped to
  // 'finished' more than ARCHIVE_GRACE_DAYS ago move to 'archived'.
  const cutoff = Math.floor((Date.now() - ARCHIVE_GRACE_DAYS * DAY_MS) / 1000);
  for (const w of watchingRepo.listAiring()) {
    try {
      const media = await fetchMediaWithSchedule(w.media_id);
      if (!media.nextAiringEpisode && media.status !== "RELEASING") {
        watchingRepo.setStatus(w.group_id, w.media_id, "finished");
      }
    } catch (err) {
      console.error(`rollover refresh failed for media ${w.media_id}:`, err);
    }
  }
  const archiveStmt = db.prepare<[number]>(
    `UPDATE watching SET status = 'archived' WHERE status = 'finished' AND added_at < ?`
  );
  archiveStmt.run(cutoff);

  writeSeasonKey(currentKey);
}

export function startRolloverScheduler(): NodeJS.Timeout {
  const tick = async () => {
    try {
      await runRollover();
    } catch (err) {
      console.error("rollover tick error:", err);
    }
  };
  void tick();
  // Daily tick
  return setInterval(tick, DAY_MS);
}
