import { isAffirmative } from "@/lib/conversation-intent";

/**
 * @param {number[]} selectedAreas
 * @param {object[]} pricingTable
 * @returns {string}
 */
export function formatTattooLocation(selectedAreas, pricingTable) {
  const areas = Array.isArray(selectedAreas) ? selectedAreas : [];
  if (!areas.length) return "Não informado";

  const table = Array.isArray(pricingTable) ? pricingTable : [];
  const parts = areas.map((area) => {
    const row = table.find((item) => Number(item?.area) === Number(area));
    const label = String(row?.areaLabel || "").trim();
    return label || `Área ${area}`;
  });

  return parts.join(", ");
}

/**
 * @param {string} text
 * @returns {number[]}
 */
export function extractAreaNumbers(text) {
  const matches = String(text || "").match(/\d+/g) || [];
  const values = matches
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(values)];
}

/**
 * @param {object[]} pricingTable
 * @returns {Set<number>}
 */
export function pricingAreaIds(pricingTable) {
  const ids = new Set();
  for (const row of Array.isArray(pricingTable) ? pricingTable : []) {
    const area = Number(row?.area);
    if (Number.isInteger(area) && area > 0) ids.add(area);
  }
  return ids;
}

/**
 * @param {number[]} areas
 * @param {object[]} pricingTable
 * @returns {boolean}
 */
export function areasExist(areas, pricingTable) {
  const list = Array.isArray(areas) ? areas : [];
  if (!list.length) return false;
  const ids = pricingAreaIds(pricingTable);
  return list.every((area) => ids.has(Number(area)));
}

/**
 * Quando há áreas inválidas (ex.: 134), tenta desmembrar dígitos (1,3,4)
 * se todos existirem no catálogo.
 * @param {number[]} selectedAreas
 * @param {object[]} pricingTable
 * @returns {number[] | null}
 */
export function suggestSplitFromInvalidAreas(selectedAreas, pricingTable) {
  const list = Array.isArray(selectedAreas) ? selectedAreas.map(Number) : [];
  if (!list.length) return null;

  const ids = pricingAreaIds(pricingTable);
  const invalid = list.filter((area) => !ids.has(area));
  if (!invalid.length) return null;

  /** @type {number[]} */
  const suggested = [];
  for (const area of list) {
    if (ids.has(area)) {
      if (!suggested.includes(area)) suggested.push(area);
      continue;
    }

    const digits = String(area)
      .split("")
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 1 && d <= 9);

    if (digits.length < 2) return null;
    if (!digits.every((d) => ids.has(d))) return null;
    for (const d of digits) {
      if (!suggested.includes(d)) suggested.push(d);
    }
  }

  if (!suggested.length) return null;

  const sameAsOriginal =
    suggested.length === list.length && suggested.every((area, i) => area === list[i]);
  if (sameAsOriginal) return null;

  return suggested;
}

/**
 * @param {number[]} areas
 * @returns {string}
 */
export function formatAreasList(areas) {
  const list = (Array.isArray(areas) ? areas : []).map(Number).filter((n) => n > 0);
  if (!list.length) return "";
  if (list.length === 1) return String(list[0]);
  if (list.length === 2) return `${list[0]} e ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

/**
 * @param {number[]} suggestedAreas
 * @returns {string}
 */
export function buildAreaConfirmMessage(suggestedAreas) {
  const list = formatAreasList(suggestedAreas);
  return (
    `Você quis dizer as áreas *${list}*?\n\n` +
    `Para confirmar diga *sim*.\n` +
    `Se não, descreva as áreas separando os números por vírgula (ex: 1,3,4).`
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isAreaConfirmationAffirmative(text) {
  const cleaned = String(text || "")
    .replace(/[!?.]+$/g, "")
    .trim();
  return isAffirmative(cleaned);
}

/**
 * Resolve a seleção de áreas do catálogo.
 * @param {string} text
 * @param {object[]} pricingTable
 * @returns {{ status: 'empty' } | { status: 'valid', areas: number[] } | { status: 'confirm', suggestedAreas: number[] } | { status: 'retry' }}
 */
export function resolveAreaSelection(text, pricingTable) {
  const areas = extractAreaNumbers(text);
  if (!areas.length) return { status: "empty" };
  if (areasExist(areas, pricingTable)) return { status: "valid", areas };

  const suggestedAreas = suggestSplitFromInvalidAreas(areas, pricingTable);
  if (suggestedAreas?.length) return { status: "confirm", suggestedAreas };
  return { status: "retry" };
}
