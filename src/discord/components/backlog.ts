import type { ButtonInteraction } from "discord.js";
import { episodesRepo } from "../../db/repos/episodes.js";
import { groupsRepo, membersRepo } from "../../db/repos/groups.js";
import { watchingRepo } from "../../db/repos/watching.js";

// Custom id format: backlog:mark:<groupId>:<mediaId>:<episode>
export async function handleBacklogButton(interaction: ButtonInteraction): Promise<void> {
  const [, action, groupIdRaw, mediaIdRaw, episodeRaw] = interaction.customId.split(":");
  if (action !== "mark") return;
  const groupId = Number(groupIdRaw);
  const mediaId = Number(mediaIdRaw);
  const episode = Number(episodeRaw);

  const group = groupsRepo.byId(groupId);
  if (!group) {
    await interaction.reply({ content: "Group no longer exists.", ephemeral: true });
    return;
  }
  const member = membersRepo.get(groupId, interaction.user.id);
  const canEdit = group.creator_id === interaction.user.id || member?.can_edit === 1;
  if (!canEdit) {
    await interaction.reply({ content: "You need edit permission to mark episodes.", ephemeral: true });
    return;
  }
  const show = watchingRepo.get(groupId, mediaId);
  if (!show) {
    await interaction.reply({ content: "Show no longer in the watching list.", ephemeral: true });
    return;
  }
  episodesRepo.setWatched(groupId, mediaId, episode, true);
  await interaction.reply({ content: `Marked **${show.title}** ep ${episode} watched.`, ephemeral: true });
}
