import { updateDb } from "@/lib/simple-db";

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
 * @returns {object | null}
 */
export function getInteraction(db, number, step) {
  const list = Array.isArray(db?.pendingInteractions) ? db.pendingInteractions : [];
  const row = list.find((item) => item?.number === number && item?.step === step);
  if (!row || isInteractionExpired(row)) return null;
  return row.data && typeof row.data === "object" ? row.data : {};
}

/**
 * @param {object} db
 * @param {string} number
 * @returns {boolean}
 */
export function hasMainMenuPending(db, number) {
  return Boolean(getInteraction(db, number, INTERACTION_STEPS.MAIN_MENU));
}

/**
 * @param {string} number
 * @param {string} step
 * @param {object} data
 */
export async function upsertInteraction(number, step, data) {
  const expiresAt = new Date(Date.now() + INTERACTION_TTL_MS).toISOString();
  await updateDb((draft) => {
    draft.pendingInteractions = Array.isArray(draft.pendingInteractions)
      ? draft.pendingInteractions
      : [];
    const idx = draft.pendingInteractions.findIndex(
      (item) => item?.number === number && item?.step === step,
    );
    const row = {
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
 */
export async function clearInteraction(number, step) {
  await updateDb((draft) => {
    draft.pendingInteractions = (draft.pendingInteractions || []).filter((item) => {
      if (item?.number !== number) return true;
      if (!step) return false;
      return item?.step !== step;
    });
    return draft;
  });
}

/**
 * @param {string} number
 */
export async function clearAllInteractions(number) {
  await clearInteraction(number);
}

/**
 * Hidrata Maps em memória a partir do snapshot do banco (sobrevive a restart).
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

    switch (row.step) {
      case INTERACTION_STEPS.MAIN_MENU:
        maps.pendingPollByNumber.set(row.number, createdAt);
        break;
      case INTERACTION_STEPS.CATALOG_AREAS:
        maps.pendingCatalogAreasByNumber.set(row.number, createdAt);
        break;
      case INTERACTION_STEPS.POST_QUOTE:
        maps.pendingPostQuoteChoiceByNumber.set(row.number, data);
        break;
      case INTERACTION_STEPS.HANDOFF_AREAS:
        maps.pendingHandoffAreasByNumber.set(row.number, data);
        break;
      case INTERACTION_STEPS.HANDOFF_PHOTOS:
        maps.pendingHandoffPhotosByNumber.set(row.number, data);
        break;
      default:
        break;
    }
  }
}

/**
 * @param {string} number
 * @param {object} maps
 */
export async function persistMainMenu(number, maps) {
  const createdAt = Date.now();
  maps.pendingPollByNumber.set(number, createdAt);
  await upsertInteraction(number, INTERACTION_STEPS.MAIN_MENU, { createdAt });
}

/**
 * @param {string} number
 * @param {object} maps
 */
export async function persistCatalogAreas(number, maps) {
  const createdAt = Date.now();
  maps.pendingCatalogAreasByNumber.set(number, createdAt);
  await upsertInteraction(number, INTERACTION_STEPS.CATALOG_AREAS, { createdAt });
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 */
export async function persistPostQuote(number, data, maps) {
  maps.pendingPostQuoteChoiceByNumber.set(number, data);
  await upsertInteraction(number, INTERACTION_STEPS.POST_QUOTE, data);
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 */
export async function persistHandoffAreas(number, data, maps) {
  maps.pendingHandoffAreasByNumber.set(number, data);
  await upsertInteraction(number, INTERACTION_STEPS.HANDOFF_AREAS, data);
}

/**
 * @param {string} number
 * @param {object} data
 * @param {object} maps
 */
export async function persistHandoffPhotos(number, data, maps) {
  maps.pendingHandoffPhotosByNumber.set(number, data);
  await upsertInteraction(number, INTERACTION_STEPS.HANDOFF_PHOTOS, data);
}

/**
 * @param {string} number
 * @param {object} maps
 */
export async function clearMenuFlow(number, maps) {
  maps.pendingPollByNumber.delete(number);
  maps.pendingCatalogAreasByNumber.delete(number);
  maps.pendingPostQuoteChoiceByNumber.delete(number);
  maps.pendingHandoffAreasByNumber.delete(number);
  maps.pendingHandoffPhotosByNumber.delete(number);
  await clearAllInteractions(number);
}
