import type { AutocompleteInteraction } from "discord.js";
import { groupsRepo } from "../db/repos/groups.js";
import { watchingRepo } from "../db/repos/watching.js";

export async function groupNameAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) return interaction.respond([]);
  const focused = interaction.options.getFocused().toLowerCase();
  const groups = groupsRepo.listForUser(interaction.guildId, interaction.user.id);
  const filtered = groups
    .filter((g) => g.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((g) => ({ name: g.name, value: g.name }));
  await interaction.respond(filtered);
}

export async function watchingMediaAutocomplete(
  interaction: AutocompleteInteraction,
  groupId: number
): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const shows = watchingRepo.listForGroup(groupId);
  const filtered = shows
    .filter((s) => s.title.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((s) => ({ name: s.title, value: s.media_id }));
  await interaction.respond(filtered);
}
