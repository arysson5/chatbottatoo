import {
  MAX_USED_PIX_TRANSACTIONS,
  normalizeTransactionId,
  withDefaults,
} from "@/lib/db-defaults";
import { readDbFromJson, updateDbJson, writeDbToJson } from "@/lib/json-db";
import { persistDbSnapshot, readDbFromPostgres, updateDbPostgres } from "@/lib/postgres-db";

function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * @param {object} db
 * @param {string} transactionId
 * @returns {{ id: string, number: string, usedAt: string } | null}
 */
export function findUsedPixTransaction(db, transactionId) {
  const id = normalizeTransactionId(transactionId);
  if (!id) return null;
  const list = Array.isArray(db?.usedPixTransactionIds) ? db.usedPixTransactionIds : [];
  return list.find((item) => normalizeTransactionId(item?.id) === id) || null;
}

/**
 * @param {object} draft
 * @param {string} transactionId
 * @param {string} number
 */
export function registerUsedPixTransaction(draft, transactionId, number) {
  const id = normalizeTransactionId(transactionId);
  if (!id) return;
  const list = Array.isArray(draft.usedPixTransactionIds) ? draft.usedPixTransactionIds : [];
  if (list.some((item) => normalizeTransactionId(item?.id) === id)) return;
  list.unshift({
    id,
    number,
    usedAt: new Date().toISOString(),
  });
  draft.usedPixTransactionIds = list.slice(0, MAX_USED_PIX_TRANSACTIONS);
}

export async function readDb() {
  if (shouldUsePostgres()) {
    try {
      return await readDbFromPostgres();
    } catch (error) {
      console.error("[db] postgres read fallback para JSON", error?.message || error);
    }
  }
  return readDbFromJson();
}

export async function writeDb(nextDb) {
  const safeDb = withDefaults(nextDb);
  if (shouldUsePostgres()) {
    try {
      return await persistDbSnapshot(safeDb);
    } catch (error) {
      console.error("[db] postgres write fallback para JSON", error?.message || error);
    }
  }
  return writeDbToJson(safeDb);
}

export async function updateDb(updater) {
  if (shouldUsePostgres()) {
    try {
      return await updateDbPostgres(updater);
    } catch (error) {
      console.error("[db] postgres update fallback para JSON", error?.message || error);
    }
  }
  return updateDbJson(updater);
}

// re-export for scripts
export { withDefaults } from "@/lib/db-defaults";
