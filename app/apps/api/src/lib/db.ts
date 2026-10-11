import "dotenv/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client.js";

// The compiled output lives one level deeper (dist/src/lib) than the source (src/lib),
// so resolve the API package root by walking up to its package.json instead of counting "..".
let apiDirectory = dirname(fileURLToPath(import.meta.url));
while (!existsSync(resolve(apiDirectory, "package.json"))) {
  const parent = dirname(apiDirectory);
  if (parent === apiDirectory)
    throw new Error("Cannot locate the API package root");
  apiDirectory = parent;
}
const databasePath = resolve(apiDirectory, "dev.db").replaceAll("\\", "/");
const expectedUrl = `file:${databasePath}`;
export const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL must be configured");
if (databaseUrl !== expectedUrl)
  throw new Error(`DATABASE_URL must equal ${expectedUrl}`);
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
export const prisma = new PrismaClient({ adapter });
