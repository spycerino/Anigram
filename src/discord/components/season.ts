import type { ButtonInteraction } from "discord.js";
import { renderSeasonPage } from "../commands/season.js";

// Custom id format: season:page:<n>
export async function handleSeasonButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, pageRaw] = interaction.customId.split(":");
  if (action !== "page") return;
  const page = Math.max(1, Number(pageRaw) || 1);
  await interaction.deferUpdate();
  const { embed, components } = await renderSeasonPage(page);
  await interaction.editReply({ embeds: [embed], components });
}
