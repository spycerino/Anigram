import { db } from "../index.js";

export interface Episode {
  group_id: number;
  media_id: number;
  episode_number: number;
  aired_at: number;
  watched: number;
  watched_at: number | null;
}

const upsert = db.prepare<[number, number, number, number]>(
  `INSERT INTO episodes (group_id, media_id, episode_number, aired_at, watched)
   VALUES (?, ?, ?, ?, 0)
   ON CONFLICT(group_id, media_id, episode_number) DO UPDATE SET aired_at = excluded.aired_at`
);
const setWatchedStmt = db.prepare<[number, number | null, number, number, number]>(
  `UPDATE episodes SET watched = ?, watched_at = ?
   WHERE group_id = ? AND media_id = ? AND episode_number = ?`
);
const getOne = db.prepare<[number, number, number]>(
  `SELECT * FROM episodes WHERE group_id = ? AND media_id = ? AND episode_number = ?`
);
const listBacklog = db.prepare<[number, number]>(
  `SELECT e.*, w.title
   FROM episodes e JOIN watching w ON w.group_id = e.group_id AND w.media_id = e.media_id
   WHERE e.group_id = ? AND e.watched = 0 AND e.aired_at <= ?
   ORDER BY w.title, e.episode_number`
);
const listDueForReminder = db.prepare<[number, number]>(
  `SELECT e.* FROM episodes e
   LEFT JOIN reminder_log r
     ON r.group_id = e.group_id AND r.media_id = e.media_id AND r.episode_number = e.episode_number
   WHERE e.aired_at BETWEEN ? AND ? AND r.group_id IS NULL`
);
const insertReminderLog = db.prepare<[number, number, number, number]>(
  `INSERT OR IGNORE INTO reminder_log (group_id, media_id, episode_number, sent_at)
   VALUES (?, ?, ?, ?)`
);
const listEpisodes = db.prepare<[number, number]>(
  `SELECT * FROM episodes WHERE group_id = ? AND media_id = ? ORDER BY episode_number`
);

export interface BacklogRow extends Episode {
  title: string;
}

export const episodesRepo = {
  upsert(groupId: number, mediaId: number, episode: number, airedAt: number): void {
    upsert.run(groupId, mediaId, episode, airedAt);
  },
  setWatched(groupId: number, mediaId: number, episode: number, watched: boolean): void {
    setWatchedStmt.run(
      watched ? 1 : 0,
      watched ? Math.floor(Date.now() / 1000) : null,
      groupId,
      mediaId,
      episode
    );
  },
  get(groupId: number, mediaId: number, episode: number): Episode | undefined {
    return getOne.get(groupId, mediaId, episode) as Episode | undefined;
  },
  backlog(groupId: number, now = Math.floor(Date.now() / 1000)): BacklogRow[] {
    return listBacklog.all(groupId, now) as BacklogRow[];
  },
  dueForReminder(fromUnix: number, toUnix: number): Episode[] {
    return listDueForReminder.all(fromUnix, toUnix) as Episode[];
  },
  markReminderSent(groupId: number, mediaId: number, episode: number): void {
    insertReminderLog.run(groupId, mediaId, episode, Math.floor(Date.now() / 1000));
  },
  listForShow(groupId: number, mediaId: number): Episode[] {
    return listEpisodes.all(groupId, mediaId) as Episode[];
  },
};
