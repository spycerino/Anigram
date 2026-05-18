import { Client, Collection, GatewayIntentBits, type ChatInputCommandInteraction, type AutocompleteInteraction, type SlashCommandBuilder } from "discord.js";

export interface SlashCommand {
  data: SlashCommandBuilder | ReturnType<SlashCommandBuilder["toJSON"]> extends infer _ ? any : any;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export class AnigramClient extends Client {
  commands = new Collection<string, SlashCommand>();

  constructor() {
    super({
      intents: [GatewayIntentBits.Guilds],
    });
  }
}
