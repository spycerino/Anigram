import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { Events } from "discord.js";
import { config } from "./config.js";
import { AnigramClient } from "./discord/client.js";
import "./db/index.js"; // initialize DB + run schema
import { startReminderScheduler } from "./services/reminders.js";
import { startRolloverScheduler } from "./services/rollover.js";
import { handleBacklogButton } from "./discord/components/backlog.js";

const here = dirname(fileURLToPath(import.meta.url));

async function loadCommands(client: AnigramClient): Promise<void> {
  const commandsDir = join(here, "discord", "commands");
  const files = readdirSync(commandsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  for (const file of files) {
    const mod = await import(pathToFileURL(join(commandsDir, file)).href);
    const cmd = mod.default;
    if (cmd?.data?.name) client.commands.set(cmd.data.name, cmd);
  }
}

async function main() {
  const client = new AnigramClient();
  await loadCommands(client);

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    startReminderScheduler(c);
    startRolloverScheduler();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      } else if (interaction.isAutocomplete()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction);
      } else if (interaction.isButton()) {
        if (interaction.customId.startsWith("backlog:")) {
          await handleBacklogButton(interaction);
        }
      }
    } catch (err) {
      console.error(err);
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: "Something went wrong.", ephemeral: true }).catch(() => {});
      }
    }
  });

  await client.login(config.discordToken);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
