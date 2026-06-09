import {
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ensure, resolveGroup } from "../../services/permissions.js";
import { watchingRepo } from "../../db/repos/watching.js";
import { episodesRepo } from "../../db/repos/episodes.js";
import { searchMediaInCurrentSeason, displayTitle } from "../../anilist/seasonShows.js";
import { seedShowForGroup } from "../../services/watchSeed.js";
import { groupsRepo } from "../../db/repos/groups.js";
import { startAddMany } from "../components/addMany.js";

const data = new SlashCommandBuilder()
  .setName("watch")
  .setDescription("Manage a group's currently-watching list.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add a show from the current season (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName("show").setDescription("Show (search current season)").setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("add-many")
      .setDescription("Add multiple shows from the current season at once (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove a show from the watching list (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) =>
        o.setName("show").setDescription("Show to remove").setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("Show what a group is watching.")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("tag-on-reminder")
      .setDescription("Toggle tagging group members on reminders for a show (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("show").setDescription("Show").setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName("enabled").setDescription("Enable tagging").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("tag-all")
      .setDescription("Toggle tagging on reminders for every show in the group (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addBooleanOption((o) => o.setName("enabled").setDescription("Enable tagging").setRequired(true))
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Use this in a server.", ephemeral: true });
    return;
  }
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const sub = interaction.options.getSubcommand();
  const groupName = interaction.options.getString("group", true);
  const r = resolveGroup(guildId, groupName, userId);
  if (!r) {
    await interaction.reply({ content: `Group **${groupName}** not found.`, ephemeral: true });
    return;
  }

  if (sub === "list") {
    if (ensure(r, "member")) {
      await interaction.reply({ content: `You're not a member of **${r.group.name}**.`, ephemeral: true });
      return;
    }
    const shows = watchingRepo.listForGroup(r.group.id);
    if (!shows.length) {
      await interaction.reply({ content: `**${r.group.name}** isn't watching anything yet.`, ephemeral: true });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const lines = shows.map((s) => {
      const eps = episodesRepo.listForShow(r.group.id, s.media_id);
      const next = eps.find((e) => e.aired_at > now);
      const unwatched = eps.filter((e) => e.aired_at <= now && !e.watched).length;
      const nextText = next ? ` • next ep ${next.episode_number} <t:${next.aired_at}:R>` : "";
      const backlogText = unwatched ? ` • backlog: ${unwatched}` : "";
      const tagText = s.tag_on_reminder ? " 🔔" : "";
      return `• **${s.title}**${tagText} — ${s.status}${nextText}${backlogText}`;
    });
    const embed = new EmbedBuilder().setTitle(`Watching — ${r.group.name}`).setDescription(lines.join("\n"));
    await interaction.reply({ embeds: [embed] });
    return;
  }

  // mutating subcommands need edit perms
  const err = ensure(r, "editor");
  if (err) return void interaction.reply({ content: err, ephemeral: true });

  if (sub === "add") {
    const mediaIdRaw = interaction.options.getString("show", true);
    const mediaId = Number(mediaIdRaw);
    if (!Number.isFinite(mediaId)) {
      await interaction.reply({ content: "Pick a show from the autocomplete suggestions.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const title = await seedShowForGroup(r.group.id, mediaId);
      const g = groupsRepo.byId(r.group.id);
      const channelHint = g?.notification_channel_id
        ? `Reminders will post in <#${g.notification_channel_id}>.`
        : "Set a notification channel with `/group set-channel` to receive reminders.";
      await interaction.editReply(`Added **${title}** to **${r.group.name}**. ${channelHint}`);
    } catch (e) {
      console.error(e);
      await interaction.editReply("Failed to fetch show details from AniList.");
    }
    return;
  }

  if (sub === "add-many") {
    await startAddMany(interaction, r.group.id, r.group.name);
    return;
  }

  if (sub === "remove") {
    const mediaId = Number(interaction.options.getString("show", true));
    if (!Number.isFinite(mediaId)) {
      await interaction.reply({ content: "Pick a show from the autocomplete suggestions.", ephemeral: true });
      return;
    }
    const existing = watchingRepo.get(r.group.id, mediaId);
    watchingRepo.remove(r.group.id, mediaId);
    await interaction.reply({
      content: existing ? `Removed **${existing.title}** from **${r.group.name}**.` : "Nothing to remove.",
      ephemeral: true,
    });
    return;
  }

  if (sub === "tag-all") {
    const enabled = interaction.options.getBoolean("enabled", true);
    const shows = watchingRepo.listForGroup(r.group.id);
    if (!shows.length) {
      await interaction.reply({ content: `**${r.group.name}** isn't watching anything yet.`, ephemeral: true });
      return;
    }
    const changed = watchingRepo.setTagOnReminderForGroup(r.group.id, enabled);
    await interaction.reply({
      content: `Tagging on reminders for all ${changed} show${changed === 1 ? "" : "s"} in **${r.group.name}** is now ${enabled ? "ON" : "OFF"}.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "tag-on-reminder") {
    const mediaId = Number(interaction.options.getString("show", true));
    const enabled = interaction.options.getBoolean("enabled", true);
    const show = watchingRepo.get(r.group.id, mediaId);
    if (!show) {
      await interaction.reply({ content: "Show not in the watching list.", ephemeral: true });
      return;
    }
    watchingRepo.setTagOnReminder(r.group.id, mediaId, enabled);
    await interaction.reply({
      content: `Tagging on reminders for **${show.title}** is now ${enabled ? "ON" : "OFF"}.`,
      ephemeral: true,
    });
    return;
  }
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  if (focused.name === "group") {
    const guildId = interaction.guildId;
    if (!guildId) return interaction.respond([]);
    const groups = (await import("../../db/repos/groups.js")).groupsRepo.listForUser(
      guildId,
      interaction.user.id
    );
    const filtered = groups
      .filter((g) => g.name.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, 25)
      .map((g) => ({ name: g.name, value: g.name }));
    await interaction.respond(filtered);
    return;
  }
  if (focused.name === "show") {
    const sub = interaction.options.getSubcommand();
    if (sub === "add") {
      // search the current season on AniList
      const q = focused.value.trim();
      if (!q) return interaction.respond([]);
      try {
        const hits = await searchMediaInCurrentSeason(q);
        await interaction.respond(
          hits.slice(0, 25).map((h) => ({ name: displayTitle(h.title).slice(0, 100), value: String(h.id) }))
        );
      } catch {
        await interaction.respond([]);
      }
      return;
    }
    // remove / tag-on-reminder: pull from the group's watching list
    const groupName = interaction.options.getString("group");
    const guildId = interaction.guildId;
    if (!groupName || !guildId) return interaction.respond([]);
    const r = resolveGroup(guildId, groupName, interaction.user.id);
    if (!r) return interaction.respond([]);
    const shows = watchingRepo.listForGroup(r.group.id);
    const filtered = shows
      .filter((s) => s.title.toLowerCase().includes(focused.value.toLowerCase()))
      .slice(0, 25)
      .map((s) => ({ name: s.title.slice(0, 100), value: String(s.media_id) }));
    await interaction.respond(filtered);
    return;
  }
  await interaction.respond([]);
}

export default { data, execute, autocomplete };
