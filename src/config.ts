import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  discordToken: required("DISCORD_TOKEN"),
  clientId: required("CLIENT_ID"),
  devGuildId: process.env.DEV_GUILD_ID || undefined,
  dbPath: process.env.DB_PATH || "./anigram.db",
} as const;
