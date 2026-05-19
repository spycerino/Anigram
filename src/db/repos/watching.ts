import { db } from "../index.js";

export type WatchStatus = "airing" | "finished" | "archived";

export interface Watching {
  group_id: number;
  media_id: number;
  title: string;
  season: string;
  year: number;
  status: WatchStatus;
  tag_on_reminder: number;
  added_at: number;
}

const upsert = db.prepare<[number, number, string, string, number, WatchStatus, number]>(
  `INSERT INTO watching (group_id, media_id, title, season, year, status, added_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(group_id, media_id) DO UPDATE SET status = excluded.status`
);
const removeStmt = db.prepare<[number, number]>(
  `DELETE FROM watching WHERE group_id = ? AND media_id = ?`
);
const listForGroup = db.prepare<[number]>(
  `SELECT * FROM watching WHERE group_id = ? ORDER BY title`
);
const listAiring = db.prepare(
  `SELECT * FROM watching WHERE status = 'airing'`
);
const setTag = db.prepare<[number, number, number]>(
  `UPDATE watching SET tag_on_reminder = ? WHERE group_id = ? AND media_id = ?`
);
const setTagAll = db.prepare<[number, number]>(
  `UPDATE watching SET tag_on_reminder = ? WHERE group_id = ?`
);
const setStatusStmt = db.prepare<[WatchStatus, number, number]>(
  `UPDATE watching SET status = ? WHERE group_id = ? AND media_id = ?`
);
const getOne = db.prepare<[number, number]>(
  `SELECT * FROM watching WHERE group_id = ? AND media_id = ?`
);

export const watchingRepo = {
  add(groupId: number, mediaId: number, title: string, season: string, year: number): void {
    upsert.run(groupId, mediaId, title, season, year, "airing", Math.floor(Date.now() / 1000));
  },
  remove(groupId: number, mediaId: number): void {
    removeStmt.run(groupId, mediaId);
  },
  listForGroup(groupId: number): Watching[] {
    return listForGroup.all(groupId) as Watching[];
  },
  listAiring(): Watching[] {
    return listAiring.all() as Watching[];
  },
  setTagOnReminder(groupId: number, mediaId: number, enabled: boolean): void {
    setTag.run(enabled ? 1 : 0, groupId, mediaId);
  },
  setTagOnReminderForGroup(groupId: number, enabled: boolean): number {
    const info = setTagAll.run(enabled ? 1 : 0, groupId);
    return info.changes;
  },
  setStatus(groupId: number, mediaId: number, status: WatchStatus): void {
    setStatusStmt.run(status, groupId, mediaId);
  },
  get(groupId: number, mediaId: number): Watching | undefined {
    return getOne.get(groupId, mediaId) as Watching | undefined;
  },
};
