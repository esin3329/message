import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig, env } from "prisma/config";

const apiDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(apiDirectory, "dev.db").replaceAll("\\", "/");
const databaseUrl = `file:${databasePath}`;
if (process.env.DATABASE_URL !== databaseUrl)
  throw new Error(`DATABASE_URL must equal ${databaseUrl}`);

export default defineConfig({
  schema: resolve(apiDirectory, "prisma/schema.prisma"),
  migrations: {
    path: resolve(apiDirectory, "prisma/migrations"),
    seed: "tsx prisma/seed.ts",
  },
  datasource: { url: env("DATABASE_URL") },
});
