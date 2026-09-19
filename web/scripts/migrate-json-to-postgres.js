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
    console.log("[db:seed] Sem app-db.json — nada a importar.");
    process.exit(0);
  }

  const parsed = withDefaults(JSON.parse(raw || "{}"));
  const hasMeaningfulData =
    Boolean(parsed?.auth?.passwordHash) ||
    Boolean(parsed?.settings?.pixKey) ||
    Boolean(parsed?.settings?.handoffNumber) ||
    (Array.isArray(parsed?.settings?.managedNumbers) && parsed.settings.managedNumbers.length > 0) ||
    (Array.isArray(parsed?.settings?.secretaryNumbers) && parsed.settings.secretaryNumbers.length > 0) ||
    (Array.isArray(parsed?.pricing) && parsed.pricing.length > 0) ||
    (Array.isArray(parsed?.leads) && parsed.leads.length > 0);

  if (!force) {
    const empty = await isPostgresEmpty();
    if (!empty) {
      console.log("[db:seed] Postgres já contém dados — use --force para sobrescrever.");
      process.exit(0);
    }
    if (!hasMeaningfulData) {
      console.log("[db:seed] Postgres vazio e JSON sem configuração — pulando import.");
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
