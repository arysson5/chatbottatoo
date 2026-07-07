import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withDefaults } from "@/lib/db-defaults";
import { isPostgresEmpty, persistDbSnapshot } from "@/lib/postgres-db";
import { prisma } from "@/lib/prisma";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, "..", "data", "app-db.json");

async function main() {
  const force = process.argv.includes("--force");
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    console.error("[db:seed] DATABASE_URL não definida.");
    process.exit(1);
  }

  let raw;
  try {
    raw = await readFile(JSON_PATH, "utf-8");
  } catch {
    console.error("[db:seed] Arquivo não encontrado:", JSON_PATH);
    process.exit(1);
  }

  const parsed = withDefaults(JSON.parse(raw || "{}"));

  if (!force) {
    const empty = await isPostgresEmpty();
    if (!empty) {
      console.log("[db:seed] Postgres já contém dados — use --force para sobrescrever.");
      process.exit(0);
    }
  }

  await persistDbSnapshot(parsed);
  console.log("[db:seed] Dados importados de app-db.json para PostgreSQL.");
}

main()
  .catch((error) => {
    console.error("[db:seed] falhou:", error?.message || error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
