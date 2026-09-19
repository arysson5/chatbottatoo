import { updateDb } from "@/lib/simple-db";
import { makeScopeKey, rowMatchesScope } from "@/lib/scope-key";

export const INTERACTION_STEPS = {
  MAIN_MENU: "main_menu",
  CATALOG_AREAS: "catalog_areas",
  POST_QUOTE: "post_quote",
  HANDOFF_AREAS: "handoff_areas",
  HANDOFF_PHOTOS: "handoff_photos",
};

const INTERACTION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object | null | undefined} row
 * @returns {boolean}
 */
export function isInteractionExpired(row) {
  if (!row?.expiresAt) return false;
  return new Date(row.expiresAt).getTime() <= Date.now();
}

/**
 * @param {object} db
 * @param {string} number
 * @param {string} step
 * @param {string} [instance]
 * @returns {object | null}
 */
export function getInteraction(db, number, step, instance = "") {
  const list = Array.isArray(db?.pendingInteractions) ? db.pendingInteractions : [];
  const row = list.find(
    (item) => rowMatchesScope(item, number, instance) && item?.step === step,
  );
  if (!row || isInteractionExpired(row)) return null;
  return row.data && typeof row.data === "object" ? row.data : {};
}

/**
 * @param {object} db
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
export function hasMainMenuPending(db, number, instance = "") {
  return Boolean(getInteraction(db, number, INTERACTION_STEPS.MAIN_MENU, instance));
}

/**
 * @param {string} number
 * @param {string} step
 * @param {object} data
 * @param {string} [instance]
 */
export async function upsertInteraction(number, step, data, instance = "") {
  const inst = String(instance || "").trim();
  const expiresAt = new Date(Date.now() + INTERACTION_TTL_MS).toISOString();
  await updateDb((draft) => {
    draft.pendingInteractions = Array.isArray(draft.pendingInteractions)
      ? draft.pendingInteractions
      : [];
    const idx = draft.pendingInteractions.findIndex(
      (item) => rowMatchesScope(item, number, inst) && item?.step === step,
    );
    const row = {
      instance: inst,
      number,
      step,
      data: data && typeof data === "object" ? data : {},
      updatedAt: new Date().toISOString(),
      expiresAt,
    };
    if (idx >= 0) {
      draft.pendingInteractions[idx] = row;
    } else {
      draft.pendingInteractions.unshift(row);
    }
    draft.pendingInteractions = draft.pendingInteractions.slice(0, 200);
    return draft;
  });
}

/**
 * @param {string} number
 * @param {string} [step]
 * @param {string} [instance]
 */
export async function clearInteraction(number, step, instance = "") {
  await updateDb((draft) => {
    draft.pendingInteractions = (draft.pendingInteractions || []).filter((item) => {
      if (!rowMatchesScope(item, number, instance)) return true;
      if (!step) return false;
      return item?.step !== step;
    });
    return draft;
  });
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
export async function clearAllInteractions(number, instance = "") {
  await clearInteraction(number, undefined, instance);
}

/**
 * Hidrata Maps em memória a partir do snapshot do banco (sobrevive a restart).
 * Maps usam scopeKey = instance:number
 * @param {object} db
 * @param {object} maps
 */
export function hydrateInteractionMaps(db, maps) {
  const list = Array.isArray(db?.pendingInteractions) ? db.pendingInteractions : [];
  for (const row of list) {
    if (!row?.number || isInteractionExpired(row)) continue;
    const data = row.data && typeof row.data === "object" ? row.data : {};
    const createdAt =
      typeof data.createdAt === "number"
        ? data.createdAt
        : new Date(row.updatedAt || Date.now()).getTime();
    const scopeKey = makeScopeKey(row.instance || "", row.number);

    switch (row.step) {
      case INTERACTION_STEPS.MAIN_MENU:
        maps.pendingPollByNumber.set(scopeKey, createdAt);
        break;
      case INTERACTION_STEPS.CATALOG_AREAS:
        maps.pendingCatalogAreasByNumber.set(scopeKey, createdAt);
        break;
      case INTERACTION_STEPS.POST_QUOTE:
        maps.pendingPostQuoteChoiceByNumber.set(scopeKey, data);
        break;
      case INTERACTION_STEPS.HANDOFF_AREAS:
        maps.pendingHandoffAreasByNumber.set(scopeKey, data);
        break;
      case INTERACTION_STEPS.HANDOFF_PHOTOS:
        maps.pendingHandoffPhotosByNumber.set(scopeKey, data);
        break;
      default:
        break;
    }
  }
}

/**
 * @param {string} number
 * @param {object} maps
 * @param {string} [instance]
 */
export async function persistMainMenu(number, maps, instance = "") {
  const createdAt = Date.now();
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingPollByNumber.set(scopeKey, createdAt);
  await upsertInteraction(number, INTERACTION_STEPS.MAIN_MENU, { createdAt }, instance);
}

/**
 * @param {string} number
 * @param {object} maps
 * @param {string} [instance]
 */
export async function persistCatalogAreas(number, maps, instance = "") {
  const createdAt = Date.now();
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingCatalogAreasByNumber.set(scopeKey, createdAt);
  await upsertInteraction(number, INTERACTION_STEPS.CATALOG_AREAS, { createdAt }, instance);
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 * @param {string} [instance]
 */
export async function persistPostQuote(number, data, maps, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingPostQuoteChoiceByNumber.set(scopeKey, data);
  await upsertInteraction(number, INTERACTION_STEPS.POST_QUOTE, data, instance);
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 * @param {string} [instance]
 */
export async function persistHandoffAreas(number, data, maps, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingHandoffAreasByNumber.set(scopeKey, data);
  await upsertInteraction(number, INTERACTION_STEPS.HANDOFF_AREAS, data, instance);
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 * @param {string} [instance]
 */
export async function persistHandoffPhotos(number, data, maps, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingHandoffPhotosByNumber.set(scopeKey, data);
  await upsertInteraction(number, INTERACTION_STEPS.HANDOFF_PHOTOS, data, instance);
}

/**
 * @param {string} number
 * @param {object} maps
 * @param {string} [instance]
 */
export async function clearMenuFlow(number, maps, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  maps.pendingPollByNumber.delete(scopeKey);
  maps.pendingCatalogAreasByNumber.delete(scopeKey);
  maps.pendingPostQuoteChoiceByNumber.delete(scopeKey);
  maps.pendingHandoffAreasByNumber.delete(scopeKey);
  maps.pendingHandoffPhotosByNumber.delete(scopeKey);
  await clearAllInteractions(number, instance);
}
