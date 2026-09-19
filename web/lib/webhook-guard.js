/** @typedef {{ entry: object, messageId: string, timestampMs: number, number?: string }} GuardEntry */

export const MESSAGE_MAX_AGE_MS = 3 * 60 * 1000;
export const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
export const WELCOME_DEBOUNCE_MS = 10 * 60 * 1000;
export const OUTBOUND_MIN_GAP_MS = 400;
export const MAX_OUTBOUND_PER_INBOUND = 8;

/** @type {Map<string, number>} */
const seenMessageIds = new Map();
/** @type {Map<string, number>} */
const welcomeDebounceByScope = new Map();
/** @type {Map<string, number>} */
const lastOutboundAtByInstance = new Map();
/** @type {Map<string, Promise<void>>} */
const outboundQueues = new Map();
/** @type {Set<string>} */
const chatLocks = new Set();

/**
 * @param {Map<string, number>} map
 * @param {number} ttlMs
 */
function pruneMap(map, ttlMs) {
  const now = Date.now();
  for (const [key, at] of map.entries()) {
    if (now - at > ttlMs) map.delete(key);
  }
}

/**
 * @param {unknown} entry
 * @returns {number}
 */
export function extractMessageTimestampMs(entry) {
  if (!entry || typeof entry !== "object") return 0;
  const e = /** @type {Record<string, unknown>} */ (entry);
  const raw =
    e.messageTimestamp ??
    e.message_timestamp ??
    (e.message && typeof e.message === "object"
      ? /** @type {Record<string, unknown>} */ (e.message).messageTimestamp
      : undefined);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const n = Number(raw);
    return n < 1e12 ? n * 1000 : n;
  }
  return 0;
}

/**
 * @param {unknown} entry
 * @returns {string}
 */
export function extractMessageId(entry) {
  if (!entry || typeof entry !== "object") return "";
  const key = /** @type {Record<string, unknown>} */ (entry).key;
  if (!key || typeof key !== "object") return "";
  const id = /** @type {Record<string, unknown>} */ (key).id;
  return typeof id === "string" ? id : "";
}

/**
 * @param {string} instance
 * @param {string} messageId
 * @returns {boolean} true se já visto
 */
export function wasMessageSeen(instance, messageId) {
  if (!messageId) return false;
  pruneMap(seenMessageIds, SEEN_TTL_MS);
  const key = `${instance}:${messageId}`;
  return seenMessageIds.has(key);
}

/**
 * @param {string} instance
 * @param {string} messageId
 */
export function markMessageSeen(instance, messageId) {
  if (!messageId) return;
  pruneMap(seenMessageIds, SEEN_TTL_MS);
  seenMessageIds.set(`${instance}:${messageId}`, Date.now());
}

/**
 * @param {number} timestampMs
 * @param {number} [now]
 * @param {number} [maxAgeMs]
 * @returns {boolean}
 */
export function isMessageTooOld(timestampMs, now = Date.now(), maxAgeMs = MESSAGE_MAX_AGE_MS) {
  if (!timestampMs || !Number.isFinite(timestampMs)) return false;
  return now - timestampMs > maxAgeMs;
}

/**
 * Filtra entries: remove dups/antigas e mantém só a mais recente por chat.
 * `resolveNumber` é async opcional — se não houver number, usa messageId como bucket.
 *
 * @param {string} instance
 * @param {object[]} entries
 * @param {(entry: object) => Promise<string> | string} [resolveNumber]
 * @returns {Promise<{ toProcess: object[], ignored: { reason: string, messageId: string }[] }>}
 */
export async function filterInboundEntries(instance, entries, resolveNumber) {
  /** @type {{ reason: string, messageId: string }[]} */
  const ignored = [];
  /** @type {Map<string, { entry: object, messageId: string, timestampMs: number }>} */
  const latestByChat = new Map();
  const now = Date.now();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const messageId = extractMessageId(entry);
    const timestampMs = extractMessageTimestampMs(entry);

    if (messageId && wasMessageSeen(instance, messageId)) {
      ignored.push({ reason: "ignored_dup", messageId });
      continue;
    }
    if (isMessageTooOld(timestampMs, now)) {
      if (messageId) markMessageSeen(instance, messageId);
      ignored.push({ reason: "ignored_old", messageId });
      continue;
    }

    let number = "";
    if (typeof resolveNumber === "function") {
      number = (await resolveNumber(entry)) || "";
    }
    const chatKey = number ? `${instance}:${number}` : `${instance}:mid:${messageId || Math.random()}`;
    const prev = latestByChat.get(chatKey);
    if (prev) {
      if (prev.timestampMs <= timestampMs) {
        if (prev.messageId) markMessageSeen(instance, prev.messageId);
        ignored.push({ reason: "ignored_batch", messageId: prev.messageId });
        latestByChat.set(chatKey, { entry, messageId, timestampMs });
      } else {
        if (messageId) markMessageSeen(instance, messageId);
        ignored.push({ reason: "ignored_batch", messageId });
      }
    } else {
      latestByChat.set(chatKey, { entry, messageId, timestampMs });
    }
  }

  const toProcess = [...latestByChat.values()].map((item) => item.entry);
  return { toProcess, ignored };
}

/**
 * @param {string} scopeKey
 * @returns {boolean}
 */
export function shouldSendWelcome(scopeKey) {
  pruneMap(welcomeDebounceByScope, WELCOME_DEBOUNCE_MS);
  const last = welcomeDebounceByScope.get(scopeKey);
  if (typeof last === "number" && Date.now() - last < WELCOME_DEBOUNCE_MS) {
    return false;
  }
  return true;
}

/**
 * @param {string} scopeKey
 */
export function markWelcomeSent(scopeKey) {
  welcomeDebounceByScope.set(scopeKey, Date.now());
}

/**
 * @param {string} scopeKey
 * @returns {boolean} true se adquiriu o lock
 */
export function tryAcquireChatLock(scopeKey) {
  if (chatLocks.has(scopeKey)) return false;
  chatLocks.add(scopeKey);
  return true;
}

/**
 * @param {string} scopeKey
 */
export function releaseChatLock(scopeKey) {
  chatLocks.delete(scopeKey);
}

/**
 * Rate-limit outbound por instância (gap mínimo entre envios).
 * @param {string} instance
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withOutboundRateLimit(instance, fn) {
  const key = String(instance || "_");
  const prev = outboundQueues.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  outboundQueues.set(
    key,
    prev.then(() => gate).catch(() => gate),
  );

  await prev.catch(() => {});
  const lastAt = lastOutboundAtByInstance.get(key) || 0;
  const wait = Math.max(0, OUTBOUND_MIN_GAP_MS - (Date.now() - lastAt));
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  try {
    const result = await fn();
    lastOutboundAtByInstance.set(key, Date.now());
    return result;
  } finally {
    release();
  }
}

/**
 * Contador de outbound por inbound (cap).
 * @returns {{ count: number, canSend: () => boolean, record: () => void }}
 */
export function createOutboundCap(max = MAX_OUTBOUND_PER_INBOUND) {
  let count = 0;
  return {
    get count() {
      return count;
    },
    canSend() {
      return count < max;
    },
    record() {
      count += 1;
    },
  };
}

/** @internal testes */
export function _resetWebhookGuardForTests() {
  seenMessageIds.clear();
  welcomeDebounceByScope.clear();
  lastOutboundAtByInstance.clear();
  outboundQueues.clear();
  chatLocks.clear();
}
