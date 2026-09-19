import { evolutionFetch } from "@/lib/evolution-fetch";

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * @param {string} url
 * @returns {string}
 */
function normalizeBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/+$/, "");
}

/**
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 */
export async function evolutionFetchWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await evolutionFetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {object} key - WhatsApp message key
 */
export async function markMessageAsRead(baseUrl, instance, apiKey, key) {
  if (!baseUrl || !instance || !apiKey || !key) return false;
  const target = `${normalizeBase(baseUrl)}/chat/markMessageAsRead/${encodeURIComponent(instance)}`;
  try {
    const res = await evolutionFetchWithTimeout(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ readMessages: [key] }),
      timeoutMs: 5000,
    });
    return res.ok;
  } catch (error) {
    console.warn("[bot-ops] markAsRead failed", error?.message || error);
    return false;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 * @param {"composing" | "available" | "paused"} presence
 */
export async function sendPresence(baseUrl, instance, apiKey, number, presence = "composing") {
  if (!baseUrl || !instance || !apiKey || !number) return false;
  const target = `${normalizeBase(baseUrl)}/chat/sendPresence/${encodeURIComponent(instance)}`;
  try {
    const res = await evolutionFetchWithTimeout(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        number: String(number).replace(/\D/g, ""),
        presence,
        delay: presence === "composing" ? 1200 : 0,
      }),
      timeoutMs: 5000,
    });
    return res.ok;
  } catch (error) {
    console.warn("[bot-ops] sendPresence failed", error?.message || error);
    return false;
  }
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {object} [callData]
 */
export async function rejectCall(baseUrl, instance, apiKey, callData = {}) {
  if (!baseUrl || !instance || !apiKey) return false;
  const target = `${normalizeBase(baseUrl)}/call/reject/${encodeURIComponent(instance)}`;
  try {
    const res = await evolutionFetchWithTimeout(target, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(callData && typeof callData === "object" ? callData : {}),
      timeoutMs: 5000,
    });
    return res.ok;
  } catch (error) {
    console.warn("[bot-ops] rejectCall failed", error?.message || error);
    return false;
  }
}

/**
 * Uma tentativa suave de reconnect (sem loop de QR).
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @returns {Promise<{ ok: boolean, needsQr: boolean, data?: object }>}
 */
export async function softReconnectInstance(baseUrl, instance, apiKey) {
  if (!baseUrl || !instance || !apiKey) {
    return { ok: false, needsQr: true };
  }
  const target = `${normalizeBase(baseUrl)}/instance/connect/${encodeURIComponent(instance)}`;
  try {
    const res = await evolutionFetchWithTimeout(target, {
      method: "GET",
      headers: { apikey: apiKey },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    const data = await res.json().catch(() => ({}));
    const hasQr = Boolean(
      data?.base64 || data?.qrcode?.base64 || data?.pairingCode || data?.code,
    );
    return { ok: res.ok, needsQr: hasQr || !res.ok, data };
  } catch (error) {
    console.warn("[bot-ops] softReconnect failed", error?.message || error);
    return { ok: false, needsQr: true };
  }
}

/**
 * Extrai estado de conexão do payload CONNECTION_UPDATE.
 * @param {unknown} body
 * @returns {string}
 */
export function extractConnectionState(body) {
  if (!body || typeof body !== "object") return "";
  const b = /** @type {Record<string, unknown>} */ (body);
  const data = b.data && typeof b.data === "object" ? /** @type {Record<string, unknown>} */ (b.data) : b;
  const state = String(
    data.state || data.connection || data.status || b.state || "",
  ).toLowerCase();
  return state;
}
