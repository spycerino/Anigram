import { REST, Routes } from "discord.js";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { config } from "../config.js";

const here = dirname(fileURLToPath(import.meta.url));

async function loadCommandData(): Promise<unknown[]> {
  const commandsDir = join(here, "commands");
  const files = readdirSync(commandsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
  const data: unknown[] = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(commandsDir, file)).href);
    if (mod.default?.data) data.push(mod.default.data.toJSON());
  }
  return data;
}

async function main() {
  const body = await loadCommandData();
  const rest = new REST({ version: "10" }).setToken(config.discordToken);

  if (config.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), { body });
    console.log(`Registered ${body.length} guild commands to ${config.devGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log(`Registered ${body.length} global commands.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
