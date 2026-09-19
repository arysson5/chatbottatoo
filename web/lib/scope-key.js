/**
 * Chave composta instance+number para isolamento multi-linha.
 * @param {string} instance
 * @param {string} number
 * @returns {string}
 */
export function makeScopeKey(instance, number) {
  const inst = String(instance || "").trim();
  const num = String(number || "").replace(/\D/g, "");
  return `${inst}:${num}`;
}

/**
 * @param {string} scopeKey
 * @returns {{ instance: string, number: string }}
 */
export function parseScopeKey(scopeKey) {
  const raw = String(scopeKey || "");
  const idx = raw.indexOf(":");
  if (idx < 0) return { instance: "", number: raw.replace(/\D/g, "") };
  return {
    instance: raw.slice(0, idx),
    number: raw.slice(idx + 1).replace(/\D/g, ""),
  };
}

/**
 * Compara linha persistida com instance+number (legado: instance vazio casa com qualquer/ausente).
 * @param {{ instance?: string, number?: string } | null | undefined} row
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
export function rowMatchesScope(row, number, instance = "") {
  if (!row) return false;
  const rowNumber = String(row.number || "").replace(/\D/g, "");
  const wantNumber = String(number || "").replace(/\D/g, "");
  if (!rowNumber || rowNumber !== wantNumber) return false;
  const rowInst = String(row.instance || "").trim();
  const wantInst = String(instance || "").trim();
  if (!wantInst && !rowInst) return true;
  if (!wantInst) return !rowInst;
  if (!rowInst) return true;
  return rowInst === wantInst;
}
