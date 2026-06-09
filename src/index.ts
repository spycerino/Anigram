import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { Events } from "discord.js";
import { config } from "./config.js";
import { AnigramClient } from "./discord/client.js";
import { db } from "./db/index.js"; // initialize DB + run schema
import { startReminderScheduler } from "./services/reminders.js";
import { startRolloverScheduler } from "./services/rollover.js";
import { handleBacklogButton } from "./discord/components/backlog.js";
import { handleSeasonButton } from "./discord/components/season.js";
import { handleAddManyButton, handleAddManySelect } from "./discord/components/addMany.js";

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

  let reminderHandle: NodeJS.Timeout | undefined;
  let rolloverHandle: NodeJS.Timeout | undefined;

  client.once(Events.ClientReady, (c) => {
    console.log(`Logged in as ${c.user.tag}`);
    reminderHandle = startReminderScheduler(c);
    rolloverHandle = startRolloverScheduler();
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
        } else if (interaction.customId.startsWith("season:")) {
          await handleSeasonButton(interaction);
        } else if (interaction.customId.startsWith("addmany:")) {
          await handleAddManyButton(interaction);
        }
      } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith("addmany:")) {
          await handleAddManySelect(interaction);
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

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down...`);
    if (reminderHandle) clearInterval(reminderHandle);
    if (rolloverHandle) clearInterval(rolloverHandle);
    try {
      await client.destroy();
    } catch (err) {
      console.error("error closing discord client:", err);
    }
    try {
      db.close();
    } catch (err) {
      console.error("error closing db:", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
