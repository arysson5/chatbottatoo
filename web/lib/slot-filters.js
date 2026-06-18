const TIMEZONE = "America/Sao_Paulo";

/**
 * @param {Date} date
 * @returns {number} 0=dom .. 6=sab
 */
function getWeekdayInTz(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === "weekday")?.value || "";
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? date.getDay();
}

/**
 * @param {object[]} slots
 * @param {object} filter
 * @returns {object[]}
 */
export function filterSlots(slots, filter = {}) {
  let result = Array.isArray(slots) ? [...slots] : [];

  if (filter.dateStart) {
    const start = new Date(filter.dateStart).getTime();
    result = result.filter((s) => new Date(s.start).getTime() >= start);
  }
  if (filter.dateEnd) {
    const end = new Date(filter.dateEnd).getTime();
    result = result.filter((s) => new Date(s.start).getTime() <= end);
  }
  if (Array.isArray(filter.weekdays) && filter.weekdays.length) {
    const set = new Set(filter.weekdays.map(Number));
    result = result.filter((s) => set.has(getWeekdayInTz(new Date(s.start))));
  }

  return result.map((s, idx) => ({ ...s, id: idx + 1 }));
}

/**
 * @param {object[]} slots
 * @param {number} page
 * @param {number} pageSize
 * @returns {{ pageSlots: object[], hasMore: boolean }}
 */
export function paginateSlots(slots, page = 0, pageSize = 8) {
  const start = page * pageSize;
  const slice = slots.slice(start, start + pageSize);
  const numbered = slice.map((s, idx) => ({ ...s, id: idx + 1 }));
  return {
    pageSlots: numbered,
    hasMore: start + pageSize < slots.length,
    total: slots.length,
  };
}

/**
 * Interpretação local rápida antes do Gemini.
 * @param {string} text
 * @returns {object | null}
 */
export function parseSlotRequestLocal(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/^(mais|proximos|proximo|ver mais|outros horarios)/.test(normalized)) {
    return { intent: "show_more" };
  }

  const now = new Date();
  const weekdayMap = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    terça: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    sábado: 6,
  };

  for (const [name, day] of Object.entries(weekdayMap)) {
    if (normalized.includes(name)) {
      return { intent: "refine_dates", weekdays: [day] };
    }
  }

  if (normalized.includes("semana que vem") || normalized.includes("proxima semana")) {
    const start = new Date(now);
    const day = start.getDay();
    const daysUntilNextMonday = ((8 - day) % 7) || 7;
    start.setDate(start.getDate() + daysUntilNextMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { intent: "refine_dates", dateStart: start.toISOString(), dateEnd: end.toISOString() };
  }

  return null;
}

export function formatSlotsMessage(slots, extraHint = "") {
  if (!slots.length) {
    return "Não encontrei horários nesse período. Tente outra data (ex: sexta, semana que vem) ou diga *mais horários*.";
  }
  const lines = slots.map((s) => `${s.id} - ${s.label}`);
  let msg = `Horários disponíveis 👇\n${lines.join("\n")}\n\nEscolha pelo número ou diga "o segundo", "sexta", "semana que vem".`;
  if (extraHint) msg += `\n${extraHint}`;
  return msg;
}
