import {
  extractInlineMediaBase64,
  normalizeMimeType,
  stripBase64Prefix,
} from "@/lib/message-media";

/**
 * @param {object} data
 * @returns {{ base64: string, mimetype: string } | null}
 */
function parseMediaResponse(data) {
  if (!data || typeof data !== "object") return null;

  const base64Raw =
    (typeof data.base64 === "string" && data.base64) ||
    (typeof data?.response?.base64 === "string" && data.response.base64) ||
    (typeof data?.data?.base64 === "string" && data.data.base64) ||
    "";

  const base64 = stripBase64Prefix(base64Raw);
  const mimetype = normalizeMimeType(
    data.mimetype || data?.response?.mimetype || data.mediaType || data?.data?.mimetype || "image/jpeg",
  );

  if (!base64 || base64.length < 50) return null;
  return { base64, mimetype: mimetype || "image/jpeg" };
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {object} messageKey
 * @param {object | null} messageContent
 * @returns {Promise<{ base64: string, mimetype: string } | null>}
 */
async function fetchMediaFromEvolution(baseUrl, instance, apiKey, messageKey, messageContent) {
  if (!messageKey || typeof messageKey !== "object") return null;

  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
  const target = `${normalizedBase}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`;

  const bodies = [];
  if (messageContent) {
    bodies.push({ message: { key: messageKey, message: messageContent }, convertToMp4: false });
  }
  bodies.push({ message: { key: messageKey }, convertToMp4: false });

  for (const body of bodies) {
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(
          "[evolution-media] download falhou",
          res.status,
          errBody.slice(0, 300),
          "keyId:",
          messageKey.id,
        );
        continue;
      }

      const data = await res.json();
      const parsed = parseMediaResponse(data);
      if (parsed) return parsed;
    } catch (error) {
      console.error("[evolution-media] download erro", error);
    }
  }

  return null;
}

/**
 * Resolve mídia: inline no webhook → Evolution API (mensagem original → só key).
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {object} params
 * @param {object} params.key
 * @param {object | null} [params.message] mensagem original do webhook
 * @returns {Promise<{ base64: string, mimetype: string, source: string } | null>}
 */
export async function resolveMessageMedia(baseUrl, instance, apiKey, params) {
  const messageKey =
    params && typeof params === "object" && params.key && typeof params.key === "object"
      ? params.key
      : params;
  const originalMessage =
    params && typeof params === "object" && params.message && typeof params.message === "object"
      ? params.message
      : null;

  const inline = extractInlineMediaBase64(originalMessage);
  if (inline) {
    console.log("[evolution-media] usando mídia inline", { source: inline.source });
  }

  const fromApiOriginal =
    messageKey && originalMessage
      ? await fetchMediaFromEvolution(baseUrl, instance, apiKey, messageKey, originalMessage)
      : null;
  if (fromApiOriginal) {
    return { ...fromApiOriginal, source: "evolution_original" };
  }

  const fromApiKeyOnly = messageKey
    ? await fetchMediaFromEvolution(baseUrl, instance, apiKey, messageKey, null)
    : null;
  if (fromApiKeyOnly) {
    return { ...fromApiKeyOnly, source: "evolution_key" };
  }

  if (inline) {
    return inline;
  }

  return null;
}

/** @deprecated Use resolveMessageMedia */
export async function downloadMessageMedia(baseUrl, instance, apiKey, params) {
  const resolved = await resolveMessageMedia(baseUrl, instance, apiKey, params);
  if (!resolved) return null;
  return { base64: resolved.base64, mimetype: resolved.mimetype };
}
