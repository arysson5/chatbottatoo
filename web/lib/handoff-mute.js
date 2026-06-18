export const HANDOFF_MUTE_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string | object} entry
 * @param {object} [options]
 * @param {string} [options.fallbackMutedAt]
 * @returns {{ number: string, reason: string, mutedAt: string, expiresAt: string }}
 */
export function normalizeMutedEntry(entry, options = {}) {
  const now = Date.now();
  if (typeof entry === "string") {
    const mutedAtMs = options.fallbackMutedAt
      ? new Date(options.fallbackMutedAt).getTime()
      : now;
    const safeMutedAt = Number.isFinite(mutedAtMs) ? mutedAtMs : now;
    return {
      number: entry,
      reason: "legacy_mute",
      mutedAt: new Date(safeMutedAt).toISOString(),
      expiresAt: new Date(safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY).toISOString(),
    };
  }

  if (entry && typeof entry === "object") {
    const number = String(entry.number || "").replace(/\D/g, "");
    const mutedAtMs = entry.mutedAt ? new Date(entry.mutedAt).getTime() : now;
    const safeMutedAt = Number.isFinite(mutedAtMs) ? mutedAtMs : now;
    const expiresAtMs = entry.expiresAt
      ? new Date(entry.expiresAt).getTime()
      : safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY;
    return {
      number,
      reason: typeof entry.reason === "string" ? entry.reason : "handoff",
      mutedAt: new Date(safeMutedAt).toISOString(),
      expiresAt: new Date(
        Number.isFinite(expiresAtMs) ? expiresAtMs : safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY,
      ).toISOString(),
    };
  }

  return {
    number: "",
    reason: "handoff",
    mutedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HANDOFF_MUTE_DAYS * MS_PER_DAY).toISOString(),
  };
}

/**
 * @param {unknown[]} list
 * @param {object[]} [leads]
 * @returns {object[]}
 */
export function normalizeMutedList(list, leads = []) {
  if (!Array.isArray(list)) return [];
  const byNumber = new Map();

  for (const raw of list) {
    let fallbackMutedAt = "";
    if (typeof raw === "string") {
      const lead = leads.find((item) => item?.number === raw);
      fallbackMutedAt = typeof lead?.createdAt === "string" ? lead.createdAt : "";
    }
    const entry = normalizeMutedEntry(raw, { fallbackMutedAt });
    if (!entry.number) continue;
    byNumber.set(entry.number, entry);
  }

  return [...byNumber.values()];
}

/**
 * @param {object[]} list
 * @param {string} number
 * @returns {boolean}
 */
export function isMuteActive(list, number) {
  const normalized = normalizeMutedList(list);
  const entry = normalized.find((item) => item.number === number);
  if (!entry) return false;
  return Date.now() < new Date(entry.expiresAt).getTime();
}

/**
 * @param {object} db
 * @returns {{ activeMutedNumbers: Set<string>, expiredNumbers: string[] }}
 */
export function splitActiveAndExpiredMutes(db) {
  const leads = Array.isArray(db?.leads) ? db.leads : [];
  const normalized = normalizeMutedList(db?.mutedLeadNumbers || [], leads);
  const now = Date.now();
  const active = [];
  const expired = [];

  for (const entry of normalized) {
    if (now >= new Date(entry.expiresAt).getTime()) {
      expired.push(entry.number);
    } else {
      active.push(entry);
    }
  }

  return {
    activeMutedNumbers: new Set(active.map((item) => item.number)),
    activeMutedEntries: active,
    expiredNumbers: expired,
  };
}

/**
 * Remove mutes expirados e devolve números ainda silenciados.
 * @param {object} db
 * @returns {Promise<Set<string>>}
 */
export async function resolveHandoffMutes(db, updateDb) {
  const { activeMutedNumbers, activeMutedEntries, expiredNumbers } = splitActiveAndExpiredMutes(db);

  if (expiredNumbers.length > 0) {
    await updateDb((draft) => {
      draft.mutedLeadNumbers = activeMutedEntries;
      return draft;
    });
    for (const number of expiredNumbers) {
      console.log("[webhook] handoff_mute_expired", { number, days: HANDOFF_MUTE_DAYS });
    }
  }

  return activeMutedNumbers;
}

/**
 * @param {object} draft
 * @param {string} number
 * @param {string} reason
 */
export function muteNumberInDraft(draft, number, reason) {
  const leads = Array.isArray(draft.leads) ? draft.leads : [];
  const current = normalizeMutedList(draft.mutedLeadNumbers || [], leads);
  const now = Date.now();
  const nextEntry = {
    number,
    reason,
    mutedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HANDOFF_MUTE_DAYS * MS_PER_DAY).toISOString(),
  };

  const withoutNumber = current.filter((item) => item.number !== number);
  draft.mutedLeadNumbers = [...withoutNumber, nextEntry];

  for (const lead of draft.leads || []) {
    if (lead?.number === number && lead?.status === "pending_handoff") {
      lead.status = "assumed_by_human";
    }
  }
}
