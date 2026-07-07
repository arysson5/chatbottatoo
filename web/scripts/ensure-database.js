/**
 * Cria o banco briza_app se não existir (volumes Postgres já inicializados).
 * Uso: node scripts/ensure-database.js
 */
import pg from "pg";

const { Client } = pg;

function parseDatabaseUrl(url) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
  };
}

function adminDatabaseName(targetDb) {
  if (targetDb === "postgres") return "postgres";
  return "evolution";
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.log("[db:provision] DATABASE_URL não definida — pulando criação do banco.");
    process.exit(0);
  }

  const config = parseDatabaseUrl(databaseUrl);
  const targetDb = config.database || "briza_app";
  const adminDb = adminDatabaseName(targetDb);

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: adminDb,
  });

  try {
    await client.connect();
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [targetDb]);
    if (exists.rowCount > 0) {
      console.log(`[db:provision] Banco "${targetDb}" já existe.`);
      return;
    }

    await client.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`[db:provision] Banco "${targetDb}" criado.`);
    try {
      await client.query(`GRANT ALL PRIVILEGES ON DATABASE "${targetDb}" TO "${config.user}"`);
    } catch {
      // grant opcional se usuário for owner
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("[db:provision] falhou:", error.message || error);
  process.exit(1);
});
