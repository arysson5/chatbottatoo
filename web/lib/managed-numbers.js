export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * @param {string | { number?: string, name?: string }} item
 * @returns {{ number: string, name: string } | null}
 */
export function normalizeManagedNumberEntry(item) {
  if (typeof item === "string") {
    const number = digitsOnly(item);
    return number ? { number, name: "" } : null;
  }
  if (item && typeof item === "object") {
    const number = digitsOnly(item.number);
    if (!number) return null;
    return { number, name: String(item.name || "").trim() };
  }
  return null;
}

/**
 * @param {unknown} list
 * @returns {{ number: string, name: string }[]}
 */
export function normalizeManagedNumbersList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const normalized = normalizeManagedNumberEntry(item);
    if (!normalized || seen.has(normalized.number)) continue;
    seen.add(normalized.number);
    out.push(normalized);
  }
  return out;
}

/**
 * @param {string} instance
 * @returns {string}
 */
export function extractInstanceDigits(instance) {
  const raw = String(instance || "");
  const match = raw.match(/(\d{10,15})$/);
  if (match) return match[1];
  return digitsOnly(raw);
}

/**
 * @param {string} instance
 * @param {unknown} managedNumbers
 * @returns {{ number: string, name: string }}
 */
export function resolveOriginFromInstance(instance, managedNumbers) {
  const number = extractInstanceDigits(instance);
  if (!number) return { number: "", name: "" };
  const list = normalizeManagedNumbersList(managedNumbers);
  const found = list.find((item) => item.number === number);
  return {
    number,
    name: found?.name || "",
  };
}

/**
 * @param {{ number?: string, name?: string }} entry
 * @returns {string}
 */
export function formatManagedNumberLabel(entry) {
  const normalized = normalizeManagedNumberEntry(entry);
  if (!normalized) return "";
  if (normalized.name) return `${normalized.name} (${normalized.number})`;
  return normalized.number;
}
