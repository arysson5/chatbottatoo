/**
 * @param {string} value
 * @returns {number}
 */
export function parseCurrencyToNumber(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return 0;
  if (raw.includes("incluido")) return 0;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
