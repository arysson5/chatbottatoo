import { makeScopeKey, rowMatchesScope } from "@/lib/scope-key";

export const HANDOFF_MUTE_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string | object} entry
 * @param {object} [options]
 * @param {string} [options.fallbackMutedAt]
 * @param {string} [options.instance]
 * @returns {{ instance: string, number: string, reason: string, mutedAt: string, expiresAt: string }}
 */
export function normalizeMutedEntry(entry, options = {}) {
  const now = Date.now();
  const defaultInstance = String(options.instance || "").trim();
  if (typeof entry === "string") {
    const mutedAtMs = options.fallbackMutedAt
      ? new Date(options.fallbackMutedAt).getTime()
      : now;
    const safeMutedAt = Number.isFinite(mutedAtMs) ? mutedAtMs : now;
    return {
      instance: defaultInstance,
      number: entry.replace(/\D/g, ""),
      reason: "legacy_mute",
      mutedAt: new Date(safeMutedAt).toISOString(),
      expiresAt: new Date(safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY).toISOString(),
    };
  }

  if (entry && typeof entry === "object") {
    const number = String(entry.number || "").replace(/\D/g, "");
    const instance = String(entry.instance || defaultInstance || "").trim();
    const mutedAtMs = entry.mutedAt ? new Date(entry.mutedAt).getTime() : now;
    const safeMutedAt = Number.isFinite(mutedAtMs) ? mutedAtMs : now;
    const expiresAtMs = entry.expiresAt
      ? new Date(entry.expiresAt).getTime()
      : safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY;
    return {
      instance,
      number,
      reason: typeof entry.reason === "string" ? entry.reason : "handoff",
      mutedAt: new Date(safeMutedAt).toISOString(),
      expiresAt: new Date(
        Number.isFinite(expiresAtMs) ? expiresAtMs : safeMutedAt + HANDOFF_MUTE_DAYS * MS_PER_DAY,
      ).toISOString(),
    };
  }

  return {
    instance: defaultInstance,
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
  const byScope = new Map();

  for (const raw of list) {
    let fallbackMutedAt = "";
    if (typeof raw === "string") {
      const lead = leads.find((item) => item?.number === raw);
      fallbackMutedAt = typeof lead?.createdAt === "string" ? lead.createdAt : "";
    }
    const entry = normalizeMutedEntry(raw, { fallbackMutedAt });
    if (!entry.number) continue;
    byScope.set(makeScopeKey(entry.instance, entry.number), entry);
  }

  return [...byScope.values()];
}

/**
 * @param {object[]} list
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
export function isMuteActive(list, number, instance = "") {
  const normalized = normalizeMutedList(list);
  const entry = normalized.find((item) => rowMatchesScope(item, number, instance));
  if (!entry) return false;
  return Date.now() < new Date(entry.expiresAt).getTime();
}

/**
 * @param {object} db
 * @returns {{ activeMutedNumbers: Set<string>, activeMutedScopes: Set<string>, activeMutedEntries: object[], expiredNumbers: string[] }}
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
    activeMutedScopes: new Set(active.map((item) => makeScopeKey(item.instance, item.number))),
    activeMutedEntries: active,
    expiredNumbers: expired,
  };
}

/**
 * Remove mutes expirados e devolve scopes ainda silenciados.
 * @param {object} db
 * @returns {Promise<Set<string>>} Set de scopeKeys instance:number
 */
export async function resolveHandoffMutes(db, updateDb) {
  const { activeMutedScopes, activeMutedEntries, expiredNumbers } = splitActiveAndExpiredMutes(db);

  if (expiredNumbers.length > 0) {
    await updateDb((draft) => {
      draft.mutedLeadNumbers = activeMutedEntries;
      return draft;
    });
    for (const number of expiredNumbers) {
      console.log("[webhook] handoff_mute_expired", { number, days: HANDOFF_MUTE_DAYS });
    }
  }

  return activeMutedScopes;
}

/**
 * @param {object} draft
 * @param {string} number
 * @param {string} reason
 * @param {string} [instance]
 */
export function muteNumberInDraft(draft, number, reason, instance = "") {
  const leads = Array.isArray(draft.leads) ? draft.leads : [];
  const current = normalizeMutedList(draft.mutedLeadNumbers || [], leads);
  const now = Date.now();
  const inst = String(instance || "").trim();
  const nextEntry = {
    instance: inst,
    number,
    reason,
    mutedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HANDOFF_MUTE_DAYS * MS_PER_DAY).toISOString(),
  };

  const without = current.filter((item) => !rowMatchesScope(item, number, inst));
  draft.mutedLeadNumbers = [...without, nextEntry];

  for (const lead of draft.leads || []) {
    if (lead?.number === number && lead?.status === "pending_handoff") {
      lead.status = "assumed_by_human";
    }
  }
}
