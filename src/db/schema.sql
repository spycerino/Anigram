PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS groups (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id                TEXT    NOT NULL,
  name                    TEXT    NOT NULL,
  creator_id              TEXT    NOT NULL,
  notification_channel_id TEXT,
  created_at              INTEGER NOT NULL,
  UNIQUE (guild_id, name)
);
CREATE INDEX IF NOT EXISTS idx_groups_guild ON groups(guild_id);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL,
  can_edit   INTEGER NOT NULL DEFAULT 0,
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS watching (
  group_id         INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  media_id         INTEGER NOT NULL,
  title            TEXT    NOT NULL,
  season           TEXT    NOT NULL,
  year             INTEGER NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'airing',  -- airing | finished | archived
  tag_on_reminder  INTEGER NOT NULL DEFAULT 0,
  added_at         INTEGER NOT NULL,
  PRIMARY KEY (group_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_watching_status ON watching(group_id, status);

CREATE TABLE IF NOT EXISTS episodes (
  group_id        INTEGER NOT NULL,
  media_id        INTEGER NOT NULL,
  episode_number  INTEGER NOT NULL,
  aired_at        INTEGER NOT NULL,
  watched         INTEGER NOT NULL DEFAULT 0,
  watched_at      INTEGER,
  PRIMARY KEY (group_id, media_id, episode_number),
  FOREIGN KEY (group_id, media_id) REFERENCES watching(group_id, media_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_episodes_aired ON episodes(aired_at);
CREATE INDEX IF NOT EXISTS idx_episodes_backlog ON episodes(group_id, watched, aired_at);

CREATE TABLE IF NOT EXISTS reminder_log (
  group_id        INTEGER NOT NULL,
  media_id        INTEGER NOT NULL,
  episode_number  INTEGER NOT NULL,
  sent_at         INTEGER NOT NULL,
  PRIMARY KEY (group_id, media_id, episode_number)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
