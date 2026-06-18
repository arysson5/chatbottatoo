const WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "documentWithCaptionMessage",
  "editedMessage",
  "buttonsResponseMessage",
];

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const PROOF_DOC_MIMES = new Set([
  "application/pdf",
  ...IMAGE_MIMES,
]);

/**
 * Desembrulha mensagens aninhadas (encaminhada, view once, documento com legenda, etc.).
 * @param {object | null | undefined} message
 * @param {number} depth
 * @returns {object | null}
 */
export function unwrapWhatsAppMessage(message, depth = 0) {
  if (!message || typeof message !== "object" || depth > 6) return null;

  for (const wrapperKey of WRAPPER_KEYS) {
    const wrapper = message[wrapperKey];
    if (!wrapper || typeof wrapper !== "object") continue;
    const inner = wrapper.message;
    if (inner && typeof inner === "object") {
      return unwrapWhatsAppMessage(inner, depth + 1);
    }
  }

  return message;
}

/**
 * @param {string} mimetype
 * @returns {string}
 */
export function normalizeMimeType(mimetype) {
  const raw = String(mimetype || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.split(";")[0].trim();
}

/**
 * @param {object} doc
 * @returns {boolean}
 */
function isProofDocument(doc) {
  if (!doc || typeof doc !== "object") return false;
  const mime = normalizeMimeType(doc.mimetype);
  if (PROOF_DOC_MIMES.has(mime)) return true;
  if (mime.startsWith("image/")) return true;

  const fileName = String(doc.fileName || doc.title || "").toLowerCase();
  return /\.(pdf|jpg|jpeg|png|webp|heic)$/.test(fileName);
}

/**
 * Detecta comprovante em foto, documento ou PDF (inclui encaminhadas).
 * @param {object | null | undefined} message
 * @returns {{ kind: "image" | "document", mimetype: string, caption: string } | null}
 */
export function detectPixProofMedia(message) {
  const unwrapped = unwrapWhatsAppMessage(message);
  if (!unwrapped) return null;

  if (unwrapped.imageMessage && typeof unwrapped.imageMessage === "object") {
    const img = unwrapped.imageMessage;
    return {
      kind: "image",
      mimetype: normalizeMimeType(img.mimetype) || "image/jpeg",
      caption: typeof img.caption === "string" ? img.caption : "",
    };
  }

  if (unwrapped.documentMessage && typeof unwrapped.documentMessage === "object") {
    const doc = unwrapped.documentMessage;
    if (!isProofDocument(doc)) return null;
    const mime = normalizeMimeType(doc.mimetype) || "application/octet-stream";
    return {
      kind: mime === "application/pdf" ? "document" : "image",
      mimetype: mime,
      caption: typeof doc.caption === "string" ? doc.caption : "",
    };
  }

  return null;
}

/**
 * @param {object | null | undefined} message
 * @returns {boolean}
 */
export function hasPixProofMedia(message) {
  return Boolean(detectPixProofMedia(message));
}

/**
 * @param {string} base64
 * @returns {string}
 */
export function stripBase64Prefix(base64) {
  const raw = String(base64 || "").trim();
  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma > 0) {
    return raw.slice(comma + 1);
  }
  return raw;
}

/**
 * @param {unknown} value
 * @returns {Buffer | null}
 */
function bufferLikeToBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    return Buffer.from(stripBase64Prefix(value), "base64");
  }
  if (typeof value === "object" && value !== null) {
    const obj = /** @type {{ type?: string, data?: number[] }} */ (value);
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Buffer.from(obj.data);
    }
  }
  return null;
}

/**
 * Tenta extrair mídia já presente no payload do webhook (sem chamar Evolution).
 * @param {object | null | undefined} message
 * @returns {{ base64: string, mimetype: string, source: string } | null}
 */
export function extractInlineMediaBase64(message) {
  const unwrapped = unwrapWhatsAppMessage(message);
  if (!unwrapped) return null;

  const img = unwrapped.imageMessage;
  if (img && typeof img === "object") {
    const buf = bufferLikeToBuffer(img.jpegThumbnail);
    if (buf && buf.length > 100) {
      return {
        base64: buf.toString("base64"),
        mimetype: normalizeMimeType(img.mimetype) || "image/jpeg",
        source: "inline_thumbnail",
      };
    }
  }

  const doc = unwrapped.documentMessage;
  if (doc && typeof doc === "object") {
    const buf = bufferLikeToBuffer(doc.jpegThumbnail);
    if (buf && buf.length > 100) {
      return {
        base64: buf.toString("base64"),
        mimetype: normalizeMimeType(doc.mimetype) || "image/jpeg",
        source: "inline_doc_thumbnail",
      };
    }
  }

  return null;
}

/**
 * MIME aceito pelo Gemini Vision para comprovante PIX.
 * @param {string} mimetype
 * @returns {string}
 */
export function mimeForGeminiProof(mimetype) {
  const mime = normalizeMimeType(mimetype);
  if (mime === "application/pdf") return "application/pdf";
  if (IMAGE_MIMES.has(mime) || mime.startsWith("image/")) return mime || "image/jpeg";
  return "image/jpeg";
}
