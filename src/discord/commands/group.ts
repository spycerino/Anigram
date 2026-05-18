import {
  ChannelType,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { groupsRepo, membersRepo } from "../../db/repos/groups.js";
import { ensure, resolveGroup } from "../../services/permissions.js";
import { groupNameAutocomplete } from "../../util/autocomplete.js";

const data = new SlashCommandBuilder()
  .setName("group")
  .setDescription("Manage Anigram watch-groups.")
  .setDMPermission(false)
  .addSubcommand((s) =>
    s.setName("create").setDescription("Create a new group.").addStringOption((o) =>
      o.setName("name").setDescription("Group name").setRequired(true)
    )
  )
  .addSubcommand((s) =>
    s.setName("delete").setDescription("Delete a group (creator only).").addStringOption((o) =>
      o.setName("name").setDescription("Group name").setRequired(true).setAutocomplete(true)
    )
  )
  .addSubcommand((s) => s.setName("list").setDescription("List groups you belong to."))
  .addSubcommand((s) =>
    s
      .setName("invite")
      .setDescription("Add a user to a group (creator only).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName("user").setDescription("User to add").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("kick")
      .setDescription("Remove a user from a group (creator only).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName("user").setDescription("User to remove").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("grant-edit")
      .setDescription("Grant edit permission (creator only).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("revoke-edit")
      .setDescription("Revoke edit permission (creator only).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("rename")
      .setDescription("Rename a group (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName("new-name").setDescription("New name").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("info")
      .setDescription("Show members, edit perms, and notification channel for a group.")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("set-channel")
      .setDescription("Set the notification channel (edit perm).")
      .addStringOption((o) => o.setName("group").setDescription("Group").setRequired(true).setAutocomplete(true))
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  );

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const name = interaction.options.getString("name", true).trim();
    if (groupsRepo.byName(guildId, name)) {
      await interaction.reply({ content: `A group named **${name}** already exists.`, ephemeral: true });
      return;
    }
    const g = groupsRepo.create(guildId, name, userId);
    await interaction.reply({ content: `Created group **${g.name}**. You're the creator with edit perms.`, ephemeral: true });
    return;
  }

  if (sub === "list") {
    const groups = groupsRepo.listForUser(guildId, userId);
    if (!groups.length) {
      await interaction.reply({ content: "You aren't in any groups yet. Try `/group create`.", ephemeral: true });
      return;
    }
    const lines = groups.map((g) => `• **${g.name}**${g.creator_id === userId ? " (creator)" : ""}`);
    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  // All remaining subcommands target an existing group.
  const groupName = interaction.options.getString(sub === "delete" ? "name" : "group", true);
  const r = resolveGroup(guildId, groupName, userId);
  if (!r) {
    await interaction.reply({ content: `Group **${groupName}** not found.`, ephemeral: true });
    return;
  }

  if (sub === "delete") {
    const err = ensure(r, "creator");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    groupsRepo.delete(r.group.id);
    await interaction.reply({ content: `Deleted **${r.group.name}**.`, ephemeral: true });
    return;
  }

  if (sub === "info") {
    const err = ensure(r, "member");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const members = membersRepo.list(r.group.id);
    const lines = members.map((m) => {
      const tags: string[] = [];
      if (m.user_id === r.group.creator_id) tags.push("creator");
      else if (m.can_edit === 1) tags.push("editor");
      const suffix = tags.length ? ` _(${tags.join(", ")})_` : "";
      return `• <@${m.user_id}>${suffix}`;
    });
    const channelText = r.group.notification_channel_id
      ? `<#${r.group.notification_channel_id}>`
      : "_not set_";
    const embed = new EmbedBuilder()
      .setTitle(`Group — ${r.group.name}`)
      .addFields(
        { name: "Notification channel", value: channelText },
        { name: `Members (${members.length})`, value: lines.join("\n") || "_none_" }
      )
      .setFooter({ text: `Created <t:${r.group.created_at}:D>` });
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (sub === "invite") {
    const err = ensure(r, "creator");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const target = interaction.options.getUser("user", true);
    if (membersRepo.get(r.group.id, target.id)) {
      await interaction.reply({ content: `${target} is already in **${r.group.name}**.`, ephemeral: true });
      return;
    }
    membersRepo.add(r.group.id, target.id, false);
    await interaction.reply({ content: `Added ${target} to **${r.group.name}**.`, ephemeral: true });
    return;
  }

  if (sub === "kick") {
    const err = ensure(r, "creator");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const target = interaction.options.getUser("user", true);
    if (target.id === r.group.creator_id) {
      await interaction.reply({ content: "The creator can't be removed.", ephemeral: true });
      return;
    }
    membersRepo.remove(r.group.id, target.id);
    await interaction.reply({ content: `Removed ${target} from **${r.group.name}**.`, ephemeral: true });
    return;
  }

  if (sub === "grant-edit" || sub === "revoke-edit") {
    const err = ensure(r, "creator");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const target = interaction.options.getUser("user", true);
    if (!membersRepo.get(r.group.id, target.id)) {
      await interaction.reply({ content: `${target} is not in **${r.group.name}**.`, ephemeral: true });
      return;
    }
    membersRepo.setEdit(r.group.id, target.id, sub === "grant-edit");
    await interaction.reply({
      content: `${sub === "grant-edit" ? "Granted" : "Revoked"} edit perms for ${target} in **${r.group.name}**.`,
      ephemeral: true,
    });
    return;
  }

  if (sub === "rename") {
    const err = ensure(r, "editor");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const newName = interaction.options.getString("new-name", true).trim();
    if (groupsRepo.byName(guildId, newName)) {
      await interaction.reply({ content: `A group named **${newName}** already exists.`, ephemeral: true });
      return;
    }
    groupsRepo.rename(r.group.id, newName);
    await interaction.reply({ content: `Renamed **${r.group.name}** to **${newName}**.`, ephemeral: true });
    return;
  }

  if (sub === "set-channel") {
    const err = ensure(r, "editor");
    if (err) return void interaction.reply({ content: err, ephemeral: true });
    const channel = interaction.options.getChannel("channel", true);
    groupsRepo.setChannel(r.group.id, channel.id);
    await interaction.reply({ content: `Notifications for **${r.group.name}** will go to <#${channel.id}>.`, ephemeral: true });
    return;
  }
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await groupNameAutocomplete(interaction);
}

export default { data, execute, autocomplete };
