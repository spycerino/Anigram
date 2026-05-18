import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ensure, resolveGroup } from "../../services/permissions.js";
import { episodesRepo } from "../../db/repos/episodes.js";
import { groupsRepo } from "../../db/repos/groups.js";

const data = new SlashCommandBuilder()
  .setName("backlog")
  .setDescription("Show aired-but-unwatched episodes for a group.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List the backlog.")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Use this in a server.", ephemeral: true });
    return;
  }
  const groupName = interaction.options.getString("group", true);
  const r = resolveGroup(interaction.guildId, groupName, interaction.user.id);
  if (!r) {
    await interaction.reply({ content: `Group **${groupName}** not found.`, ephemeral: true });
    return;
  }
  const err = ensure(r, "member");
  if (err) return void interaction.reply({ content: err, ephemeral: true });

  const rows = episodesRepo.backlog(r.group.id);
  if (!rows.length) {
    await interaction.reply({ content: `**${r.group.name}** is fully caught up.`, ephemeral: true });
    return;
  }

  const grouped = new Map<string, { title: string; episodes: number[] }>();
  for (const row of rows) {
    const key = `${row.media_id}`;
    const entry = grouped.get(key) ?? { title: row.title, episodes: [] };
    entry.episodes.push(row.episode_number);
    grouped.set(key, entry);
  }
  const lines: string[] = [];
  const buttons: ButtonBuilder[] = [];
  for (const [mediaId, { title, episodes }] of grouped) {
    lines.push(`**${title}** — eps ${episodes.join(", ")}`);
    if (r.canEdit && buttons.length < 5) {
      const firstEp = episodes[0]!;
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`backlog:mark:${r.group.id}:${mediaId}:${firstEp}`)
          .setLabel(`Mark ${title.slice(0, 30)} ep ${firstEp}`)
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }
  const embed = new EmbedBuilder().setTitle(`Backlog — ${r.group.name}`).setDescription(lines.join("\n"));
  const components = buttons.length
    ? [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
    : [];
  await interaction.reply({ embeds: [embed], components, ephemeral: true });
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return interaction.respond([]);
  const focused = interaction.options.getFocused();
  const groups = groupsRepo.listForUser(guildId, interaction.user.id);
  await interaction.respond(
    groups
      .filter((g) => g.name.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map((g) => ({ name: g.name, value: g.name }))
  );
}

export default { data, execute, autocomplete };
