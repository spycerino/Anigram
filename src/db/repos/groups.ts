import { db } from "../index.js";

export interface Group {
  id: number;
  guild_id: string;
  name: string;
  creator_id: string;
  notification_channel_id: string | null;
  created_at: number;
  is_personal: number;
}

export interface GroupMember {
  group_id: number;
  user_id: string;
  can_edit: number;
  joined_at: number;
}

const insertGroup = db.prepare<[string, string, string, number]>(
  `INSERT INTO groups (guild_id, name, creator_id, created_at) VALUES (?, ?, ?, ?)`
);
const insertPersonalGroup = db.prepare<[string, string, string, number]>(
  `INSERT INTO groups (guild_id, name, creator_id, created_at, is_personal) VALUES (?, ?, ?, ?, 1)`
);
const getPersonalGroup = db.prepare<[string, string]>(
  `SELECT * FROM groups WHERE guild_id = ? AND creator_id = ? AND is_personal = 1`
);
const insertMember = db.prepare<[number, string, number, number]>(
  `INSERT INTO group_members (group_id, user_id, can_edit, joined_at) VALUES (?, ?, ?, ?)`
);
const getGroupByName = db.prepare<[string, string]>(
  `SELECT * FROM groups WHERE guild_id = ? AND name = ?`
);
const getGroupById = db.prepare<[number]>(`SELECT * FROM groups WHERE id = ?`);
const listGroupsForUser = db.prepare<[string, string]>(
  `SELECT g.* FROM groups g
   JOIN group_members m ON m.group_id = g.id
   WHERE g.guild_id = ? AND m.user_id = ? AND g.is_personal = 0
   ORDER BY g.name`
);
const listGroupsInGuild = db.prepare<[string]>(
  `SELECT * FROM groups WHERE guild_id = ? AND is_personal = 0 ORDER BY name`
);
const deleteGroupStmt = db.prepare<[number]>(`DELETE FROM groups WHERE id = ?`);
const renameGroupStmt = db.prepare<[string, number]>(`UPDATE groups SET name = ? WHERE id = ?`);
const setChannelStmt = db.prepare<[string | null, number]>(
  `UPDATE groups SET notification_channel_id = ? WHERE id = ?`
);

const getMember = db.prepare<[number, string]>(
  `SELECT * FROM group_members WHERE group_id = ? AND user_id = ?`
);
const listMembers = db.prepare<[number]>(
  `SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at`
);
const removeMemberStmt = db.prepare<[number, string]>(
  `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`
);
const setEditStmt = db.prepare<[number, number, string]>(
  `UPDATE group_members SET can_edit = ? WHERE group_id = ? AND user_id = ?`
);

export const groupsRepo = {
  create(guildId: string, name: string, creatorId: string): Group {
    const now = Math.floor(Date.now() / 1000);
    const tx = db.transaction(() => {
      const info = insertGroup.run(guildId, name, creatorId, now);
      const groupId = Number(info.lastInsertRowid);
      insertMember.run(groupId, creatorId, 1, now);
      return groupId;
    });
    const id = tx();
    return getGroupById.get(id) as Group;
  },
  byName(guildId: string, name: string): Group | undefined {
    return getGroupByName.get(guildId, name) as Group | undefined;
  },
  byId(id: number): Group | undefined {
    return getGroupById.get(id) as Group | undefined;
  },
  listForUser(guildId: string, userId: string): Group[] {
    return listGroupsForUser.all(guildId, userId) as Group[];
  },
  listInGuild(guildId: string): Group[] {
    return listGroupsInGuild.all(guildId) as Group[];
  },
  delete(id: number): void {
    deleteGroupStmt.run(id);
  },
  rename(id: number, name: string): void {
    renameGroupStmt.run(name, id);
  },
  setChannel(id: number, channelId: string | null): void {
    setChannelStmt.run(channelId, id);
  },
  getOrCreatePersonal(guildId: string, userId: string): Group {
    const existing = getPersonalGroup.get(guildId, userId) as Group | undefined;
    if (existing) return existing;
    const now = Math.floor(Date.now() / 1000);
    const name = `__personal__${userId}`;
    const tx = db.transaction(() => {
      const info = insertPersonalGroup.run(guildId, name, userId, now);
      const groupId = Number(info.lastInsertRowid);
      insertMember.run(groupId, userId, 1, now);
      return groupId;
    });
    const id = tx();
    return getGroupById.get(id) as Group;
  },
  getPersonal(guildId: string, userId: string): Group | undefined {
    return getPersonalGroup.get(guildId, userId) as Group | undefined;
  },
};

export const membersRepo = {
  add(groupId: number, userId: string, canEdit = false): void {
    insertMember.run(groupId, userId, canEdit ? 1 : 0, Math.floor(Date.now() / 1000));
  },
  remove(groupId: number, userId: string): void {
    removeMemberStmt.run(groupId, userId);
  },
  get(groupId: number, userId: string): GroupMember | undefined {
    return getMember.get(groupId, userId) as GroupMember | undefined;
  },
  list(groupId: number): GroupMember[] {
    return listMembers.all(groupId) as GroupMember[];
  },
  setEdit(groupId: number, userId: string, canEdit: boolean): void {
    setEditStmt.run(canEdit ? 1 : 0, groupId, userId);
  },
};
