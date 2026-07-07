import { jidToDialable, resolveInboundDialable } from "@/lib/whatsapp-message";

/**
 * @param {Record<string, unknown> | null | undefined} entry
 * @returns {string | null}
 */
export function resolveInboundDialableFromEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const key = entry.key && typeof entry.key === "object" ? entry.key : null;
  const fromKey = resolveInboundDialable(key);
  if (fromKey) return fromKey;

  const remoteJid = typeof entry.remoteJid === "string" ? entry.remoteJid : "";
  if (remoteJid.endsWith("@g.us")) return null;

  const candidates = [
    remoteJid,
    typeof entry.remoteJidAlt === "string" ? entry.remoteJidAlt : "",
    typeof entry.participant === "string" ? entry.participant : "",
    typeof entry.participantAlt === "string" ? entry.participantAlt : "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.endsWith("@g.us")) continue;
    if (!candidate.endsWith("@s.whatsapp.net")) continue;
    const dialable = jidToDialable(candidate);
    if (dialable) return dialable;
  }

  return null;
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} lidJid
 * @returns {Promise<string | null>}
 */
async function resolveLidViaEvolution(baseUrl, instance, apiKey, lidJid) {
  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
  if (!normalizedBase || !instance || !apiKey || !lidJid) return null;

  const lidNumber = lidJid.split("@")[0];
  if (!lidNumber) return null;

  try {
    const res = await fetch(
      `${normalizedBase}/chat/whatsappNumbers/${encodeURIComponent(instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({ numbers: [lidNumber, lidJid] }),
      },
    );
    if (!res.ok) return null;

    const payload = await res.json();
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    for (const item of list) {
      const jid = typeof item?.jid === "string" ? item.jid : "";
      const number = typeof item?.number === "string" ? item.number : jidToDialable(jid);
      if (number && /^\d+$/.test(number.replace(/\D/g, ""))) {
        return number.replace(/\D/g, "");
      }
    }
  } catch (error) {
    console.warn("[evolution-jid] falha ao resolver LID", error?.message || error);
  }

  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} key
 * @param {Record<string, unknown> | null | undefined} entry
 * @param {{ baseUrl?: string, instance?: string, apiKey?: string }} [evolution]
 * @returns {Promise<string | null>}
 */
export async function resolveInboundNumber(key, entry, evolution = {}) {
  const direct = resolveInboundDialable(key) || resolveInboundDialableFromEntry(entry);
  if (direct) return direct;

  const remoteJid =
    (key && typeof key.remoteJid === "string" && key.remoteJid) ||
    (entry && typeof entry.remoteJid === "string" && entry.remoteJid) ||
    "";

  if (remoteJid.endsWith("@lid") && evolution.baseUrl && evolution.instance && evolution.apiKey) {
    return resolveLidViaEvolution(
      evolution.baseUrl,
      evolution.instance,
      evolution.apiKey,
      remoteJid,
    );
  }

  if (remoteJid) {
    console.log("[webhook] jid_unresolved", {
      remoteJid,
      remoteJidAlt: key?.remoteJidAlt || entry?.remoteJidAlt || null,
    });
  }

  return null;
}
