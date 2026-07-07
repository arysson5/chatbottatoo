import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultDb, withDefaults } from "@/lib/db-defaults";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = process.env.TEST_DB_FILE
  ? path.resolve(process.env.TEST_DB_FILE)
  : path.join(DATA_DIR, "app-db.json");

async function ensureDbFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DB_FILE, "utf-8");
  } catch {
    await writeFile(DB_FILE, JSON.stringify(createDefaultDb(), null, 2), "utf-8");
  }
}

export async function readDbFromJson() {
  await ensureDbFile();
  const raw = await readFile(DB_FILE, "utf-8");
  const parsed = JSON.parse(raw || "{}");
  return withDefaults(parsed);
}

export async function writeDbToJson(nextDb) {
  await ensureDbFile();
  const safeDb = withDefaults(nextDb);
  await writeFile(DB_FILE, JSON.stringify(safeDb, null, 2), "utf-8");
  return safeDb;
}

export async function updateDbJson(updater) {
  const current = await readDbFromJson();
  const updated = await updater(structuredClone(current));
  return writeDbToJson(updated);
}

export { DB_FILE };
