import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
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

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const page = Math.max(1, interaction.options.getInteger("page") ?? 1);
  const shows = await fetchCurrentSeason();
  const totalPages = Math.max(1, Math.ceil(shows.length / PAGE_SIZE));
  const slice = shows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const { season, year } = seasonForDate();

  const lines = slice.map((m) => {
    const next = m.nextAiringEpisode
      ? ` — ep ${m.nextAiringEpisode.episode} <t:${m.nextAiringEpisode.airingAt}:R>`
      : "";
    return `**[${displayTitle(m.title)}](${m.siteUrl})**${next}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${season} ${year} — page ${page}/${totalPages}`)
    .setDescription(lines.join("\n") || "No shows found.")
    .setFooter({ text: `${shows.length} shows • use /season list page:<n>` });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
