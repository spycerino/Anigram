import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Health check."),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: "pong", ephemeral: true });
  },
};
