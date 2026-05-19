import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { fetchCurrentSeason, displayTitle, type SeasonMedia } from "../../anilist/seasonShows.js";
import { watchingRepo } from "../../db/repos/watching.js";
import { groupsRepo, membersRepo } from "../../db/repos/groups.js";
import { seedShowForGroup } from "../../services/watchSeed.js";

const PAGE_SIZE = 25;
const SESSION_TTL_MS = 14 * 60 * 1000;

interface Session {
  groupId: number;
  groupName: string;
  userId: string;
  page: number;
  picks: Set<number>;
  timeout: NodeJS.Timeout;
}

const sessions = new Map<string, Session>();

function endSession(messageId: string): void {
  const s = sessions.get(messageId);
  if (!s) return;
  clearTimeout(s.timeout);
  sessions.delete(messageId);
}

function canEdit(groupId: number, userId: string): boolean {
  const group = groupsRepo.byId(groupId);
  if (!group) return false;
  if (group.creator_id === userId) return true;
  const m = membersRepo.get(groupId, userId);
  return m?.can_edit === 1;
}

function buildPayload(shows: SeasonMedia[], session: Session): {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder | ButtonBuilder>[];
} {
  const totalPages = Math.max(1, Math.ceil(shows.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, session.page), totalPages);
  session.page = page;
  const slice = shows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const options = slice.map((m) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(displayTitle(m.title).slice(0, 100))
      .setValue(String(m.id))
      .setDefault(session.picks.has(m.id));
    if (m.nextAiringEpisode) {
      opt.setDescription(`ep ${m.nextAiringEpisode.episode} next`.slice(0, 100));
    }
    return opt;
  });

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("addmany:select")
      .setPlaceholder(`Pick shows (page ${page}/${totalPages})`)
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(options)
  );

  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`addmany:page:${page - 1}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId("addmany:noop")
      .setLabel(`${page} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`addmany:page:${page + 1}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId("addmany:confirm")
      .setLabel(`Add selected (${session.picks.size})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(session.picks.size === 0),
    new ButtonBuilder()
      .setCustomId("addmany:cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
  );

  return {
    content: `Adding shows to **${session.groupName}** — ${session.picks.size} selected across all pages.`,
    components: [selectRow, navRow],
  };
}

export async function startAddMany(
  interaction: ChatInputCommandInteraction,
  groupId: number,
  groupName: string
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  let shows: SeasonMedia[];
  try {
    shows = await fetchCurrentSeason();
  } catch (e) {
    console.error(e);
    await interaction.editReply("Failed to fetch the current season from AniList.");
    return;
  }
  if (!shows.length) {
    await interaction.editReply("No shows in the current season.");
    return;
  }

  const session: Session = {
    groupId,
    groupName,
    userId: interaction.user.id,
    page: 1,
    picks: new Set(),
    timeout: setTimeout(() => {}, 0),
  };
  const payload = buildPayload(shows, session);
  const msg = await interaction.editReply(payload);
  clearTimeout(session.timeout);
  session.timeout = setTimeout(() => endSession(msg.id), SESSION_TTL_MS);
  sessions.set(msg.id, session);
}

export async function handleAddManyButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  if (action === "noop") {
    await interaction.deferUpdate();
    return;
  }
  const messageId = interaction.message.id;
  const session = sessions.get(messageId);
  if (!session) {
    await interaction.reply({
      content: "This add-many session has expired. Run `/watch add-many` again.",
      ephemeral: true,
    });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "This isn't your add-many session.", ephemeral: true });
    return;
  }

  if (action === "page") {
    session.page = Math.max(1, Number(parts[2]) || 1);
    await interaction.deferUpdate();
    const shows = await fetchCurrentSeason();
    await interaction.editReply(buildPayload(shows, session));
    return;
  }

  if (action === "cancel") {
    endSession(messageId);
    await interaction.update({ content: "Cancelled.", components: [] });
    return;
  }

  if (action === "confirm") {
    if (!canEdit(session.groupId, interaction.user.id)) {
      await interaction.reply({
        content: `You no longer have edit permission in **${session.groupName}**.`,
        ephemeral: true,
      });
      return;
    }
    if (!session.picks.size) {
      await interaction.reply({ content: "Pick at least one show first.", ephemeral: true });
      return;
    }
    const picks = [...session.picks];
    await interaction.update({
      content: `Adding ${picks.length} show${picks.length === 1 ? "" : "s"} to **${session.groupName}**...`,
      components: [],
    });

    const added: string[] = [];
    const already: string[] = [];
    const failed: number[] = [];
    for (const mediaId of picks) {
      try {
        const existing = watchingRepo.get(session.groupId, mediaId);
        const title = await seedShowForGroup(session.groupId, mediaId);
        if (existing) already.push(title);
        else added.push(title);
      } catch (e) {
        console.error(`add-many failed for media ${mediaId}:`, e);
        failed.push(mediaId);
      }
    }
    endSession(messageId);

    const lines: string[] = [];
    if (added.length) lines.push(`Added (${added.length}): ${added.join(", ")}`);
    if (already.length) lines.push(`Already in list (${already.length}): ${already.join(", ")}`);
    if (failed.length) lines.push(`Failed (${failed.length}): ${failed.join(", ")}`);
    await interaction.editReply({ content: lines.join("\n").slice(0, 2000) || "Done." });
  }
}

export async function handleAddManySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const messageId = interaction.message.id;
  const session = sessions.get(messageId);
  if (!session) {
    await interaction.reply({
      content: "This add-many session has expired. Run `/watch add-many` again.",
      ephemeral: true,
    });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: "This isn't your add-many session.", ephemeral: true });
    return;
  }
  await interaction.deferUpdate();
  const shows = await fetchCurrentSeason();
  const start = (session.page - 1) * PAGE_SIZE;
  const pageIds = new Set(shows.slice(start, start + PAGE_SIZE).map((s) => s.id));
  for (const id of pageIds) session.picks.delete(id);
  for (const v of interaction.values) session.picks.add(Number(v));
  await interaction.editReply(buildPayload(shows, session));
}
