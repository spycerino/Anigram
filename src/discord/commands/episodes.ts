import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ensure, resolveGroup } from "../../services/permissions.js";
import { watchingRepo } from "../../db/repos/watching.js";
import { episodesRepo } from "../../db/repos/episodes.js";

const data = new SlashCommandBuilder()
  .setName("episodes")
  .setDescription("Track watched/unwatched episodes (edit perm).")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("mark")
      .setDescription("Mark an episode watched (and all earlier aired episodes by default).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("show").setDescription("Show").setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) =>
        o.setName("episode").setDescription("Episode number").setRequired(true).setMinValue(1)
      )
      .addBooleanOption((o) =>
        o
          .setName("only-this")
          .setDescription("Mark only this episode, not earlier ones (default: false)")
      )
  )
  .addSubcommand((s) =>
    s
      .setName("unmark")
      .setDescription("Mark an episode unwatched (manual fix).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("show").setDescription("Show").setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) =>
        o.setName("episode").setDescription("Episode number").setRequired(true).setMinValue(1)
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Use this in a server.", ephemeral: true });
    return;
  }
  const sub = interaction.options.getSubcommand();
  const groupName = interaction.options.getString("group", true);
  const r = resolveGroup(interaction.guildId, groupName, interaction.user.id);
  if (!r) {
    await interaction.reply({ content: `Group **${groupName}** not found.`, ephemeral: true });
    return;
  }
  const err = ensure(r, "editor");
  if (err) return void interaction.reply({ content: err, ephemeral: true });

  const mediaId = Number(interaction.options.getString("show", true));
  const episode = interaction.options.getInteger("episode", true);
  const show = watchingRepo.get(r.group.id, mediaId);
  if (!show) {
    await interaction.reply({ content: "Show not in the watching list.", ephemeral: true });
    return;
  }
  const ep = episodesRepo.get(r.group.id, mediaId, episode);
  if (!ep) {
    await interaction.reply({ content: `Episode ${episode} of **${show.title}** is not tracked.`, ephemeral: true });
    return;
  }

  if (sub === "unmark") {
    episodesRepo.setWatched(r.group.id, mediaId, episode, false);
    await interaction.reply({
      content: `Unmarked **${show.title}** episode ${episode}.`,
      ephemeral: true,
    });
    return;
  }

  // sub === "mark"
  const onlyThis = interaction.options.getBoolean("only-this") ?? false;
  if (onlyThis) {
    episodesRepo.setWatched(r.group.id, mediaId, episode, true);
    await interaction.reply({
      content: `Marked **${show.title}** episode ${episode}.`,
      ephemeral: true,
    });
    return;
  }

  const changed = episodesRepo.markWatchedUpTo(r.group.id, mediaId, episode);
  const suffix =
    changed === 0
      ? `Already caught up through episode ${episode} of **${show.title}**.`
      : changed === 1
        ? `Marked **${show.title}** episode ${episode}.`
        : `Marked **${show.title}** through episode ${episode} (${changed} episodes).`;
  await interaction.reply({ content: suffix, ephemeral: true });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const guildId = interaction.guildId;
  if (!guildId) return interaction.respond([]);

  if (focused.name === "group") {
    const groups = (await import("../../db/repos/groups.js")).groupsRepo.listForUser(guildId, interaction.user.id);
    await interaction.respond(
      groups
        .filter((g) => g.name.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map((g) => ({ name: g.name, value: g.name }))
    );
    return;
  }
  if (focused.name === "show") {
    const groupName = interaction.options.getString("group");
    if (!groupName) return interaction.respond([]);
    const r = resolveGroup(guildId, groupName, interaction.user.id);
    if (!r) return interaction.respond([]);
    const shows = watchingRepo.listForGroup(r.group.id);
    await interaction.respond(
      shows
        .filter((s) => s.title.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map((s) => ({ name: s.title.slice(0, 100), value: String(s.media_id) }))
    );
    return;
  }
  await interaction.respond([]);
}

export default { data, execute, autocomplete };
