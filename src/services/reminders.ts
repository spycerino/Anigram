import { ChannelType, type Client } from "discord.js";
import { episodesRepo } from "../db/repos/episodes.js";
import { groupsRepo, membersRepo } from "../db/repos/groups.js";
import { watchingRepo } from "../db/repos/watching.js";

const TICK_MS = 60_000;
// Look-back window so episodes that aired while the bot was down (within this
// window) still get a reminder on the next tick.
const LOOKBACK_SEC = 60 * 60 * 6;

export function startReminderScheduler(client: Client): NodeJS.Timeout {
  const tick = async () => {
    try {
      await runReminderTick(client);
    } catch (err) {
      console.error("reminder tick error:", err);
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}

async function runReminderTick(client: Client): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const due = episodesRepo.dueForReminder(now - LOOKBACK_SEC, now);
  for (const ep of due) {
    const group = groupsRepo.byId(ep.group_id);
    if (!group || !group.notification_channel_id) {
      episodesRepo.markReminderSent(ep.group_id, ep.media_id, ep.episode_number);
      continue;
    }
    const show = watchingRepo.get(ep.group_id, ep.media_id);
    if (!show) {
      episodesRepo.markReminderSent(ep.group_id, ep.media_id, ep.episode_number);
      continue;
    }
    try {
      const channel = await client.channels.fetch(group.notification_channel_id);
      if (!channel || channel.type !== ChannelType.GuildText) {
        episodesRepo.markReminderSent(ep.group_id, ep.media_id, ep.episode_number);
        continue;
      }
      let mentions = "";
      if (show.tag_on_reminder) {
        const members = membersRepo.list(group.id);
        mentions = members.map((m) => `<@${m.user_id}>`).join(" ");
      }
      const body = [
        mentions,
        `**${show.title}** — episode ${ep.episode_number} is airing <t:${ep.aired_at}:R>.`,
      ]
        .filter(Boolean)
        .join("\n");
      await channel.send({ content: body });
      episodesRepo.markReminderSent(ep.group_id, ep.media_id, ep.episode_number);
    } catch (err) {
      console.error(`failed to send reminder for group ${ep.group_id} media ${ep.media_id} ep ${ep.episode_number}:`, err);
    }
  }
}
