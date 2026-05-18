import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { fetchCurrentSeason, displayTitle } from "../../anilist/seasonShows.js";
import { seasonForDate } from "../../anilist/season.js";

const PAGE_SIZE = 15;

const data = new SlashCommandBuilder()
  .setName("season")
  .setDescription("Current anime season.")
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("List shows airing in the current season.")
      .addIntegerOption((o) => o.setName("page").setDescription("Page number (1-based)"))
  );

export async function renderSeasonPage(page: number): Promise<{
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const shows = await fetchCurrentSeason();
  const totalPages = Math.max(1, Math.ceil(shows.length / PAGE_SIZE));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const slice = shows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE);
  const { season, year } = seasonForDate();

  const lines = slice.map((m) => {
    const next = m.nextAiringEpisode
      ? ` — ep ${m.nextAiringEpisode.episode} <t:${m.nextAiringEpisode.airingAt}:R>`
      : "";
    return `**[${displayTitle(m.title)}](${m.siteUrl})**${next}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${season} ${year} — page ${clamped}/${totalPages}`)
    .setDescription(lines.join("\n") || "No shows found.")
    .setFooter({ text: `${shows.length} shows` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`season:page:${clamped - 1}`)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clamped <= 1),
    new ButtonBuilder()
      .setCustomId("season:noop")
      .setLabel(`${clamped} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`season:page:${clamped + 1}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(clamped >= totalPages)
  );

  return { embed, components: [row] };
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const page = Math.max(1, interaction.options.getInteger("page") ?? 1);
  const { embed, components } = await renderSeasonPage(page);
  await interaction.editReply({ embeds: [embed], components });
}

export default { data, execute };
