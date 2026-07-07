import { unwrapWhatsAppMessage } from "@/lib/message-media";

/**
 * @param {object} message
 * @returns {string}
 */
function extractTextFromMessageBody(message) {
  if (typeof message.conversation === "string") return message.conversation;
  const ext = message.extendedTextMessage;
  if (ext && typeof ext === "object" && typeof ext.text === "string") return ext.text;
  const img = message.imageMessage;
  if (img && typeof img === "object" && typeof img.caption === "string") return img.caption;
  const vid = message.videoMessage;
  if (vid && typeof vid === "object" && typeof vid.caption === "string") return vid.caption;
  const doc = message.documentMessage;
  if (doc && typeof doc === "object" && typeof doc.caption === "string") return doc.caption;
  return "";
}

/**
 * Extrai texto legível de payloads de mensagem (Evolution / Baileys).
 * @param {object | null | undefined} message
 * @returns {string}
 */
export function extractMessageText(message) {
  if (!message || typeof message !== "object") return "";

  const unwrapped = unwrapWhatsAppMessage(message) || message;
  const fromUnwrapped = extractTextFromMessageBody(unwrapped);
  if (fromUnwrapped) return fromUnwrapped;

  return extractTextFromMessageBody(message);
}

/**
 * @param {object | null | undefined} message
 * @returns {boolean}
 */
export function hasAudioAttachment(message) {
  if (!message || typeof message !== "object") return false;
  const unwrapped = unwrapWhatsAppMessage(message) || message;
  if (unwrapped.audioMessage && typeof unwrapped.audioMessage === "object") return true;
  if (unwrapped.pttMessage && typeof unwrapped.pttMessage === "object") return true;
  return false;
}

/**
 * @param {unknown} data
 * @returns {object[]}
 */
export function flattenWebhookMessageEntries(data) {
  if (!data) return [];
  if (typeof data !== "object") return [];
  const d = /** @type {Record<string, unknown>} */ (data);
  if (Array.isArray(d.messages)) {
    return d.messages.filter((x) => x && typeof x === "object").map((x) => /** @type {object} */ (x));
  }
  if (d.key !== undefined) {
    return [d];
  }
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object").map((x) => /** @type {object} */ (x));
  }
  return [];
}

/**
 * @param {string} remoteJid
 * @returns {string | null}
 */
export function jidToDialable(remoteJid) {
  if (!remoteJid || typeof remoteJid !== "string") return null;
  const base = remoteJid.split("@")[0];
  if (!/^\d+$/.test(base)) return null;
  return base;
}

/**
 * Resolve o número do remetente em payloads Evolution/Baileys (inclui @lid e participantAlt).
 * Ignora grupos (@g.us).
 * @param {Record<string, unknown> | null | undefined} key
 * @returns {string | null}
 */
export function resolveInboundDialable(key) {
  if (!key || typeof key !== "object") return null;

  const remoteJid = typeof key.remoteJid === "string" ? key.remoteJid : "";
  if (remoteJid.endsWith("@g.us")) return null;

  const candidates = [
    remoteJid,
    typeof key.remoteJidAlt === "string" ? key.remoteJidAlt : "",
    typeof key.participant === "string" ? key.participant : "",
    typeof key.participantAlt === "string" ? key.participantAlt : "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.endsWith("@g.us")) continue;
    if (!candidate.endsWith("@s.whatsapp.net")) continue;
    const dialable = jidToDialable(candidate);
    if (dialable) return dialable;
  }

  return null;
}
