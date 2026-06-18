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
