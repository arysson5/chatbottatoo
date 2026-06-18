/**
 * Parser determinístico de texto OCR/PDF de comprovantes PIX brasileiros.
 */

const RECIPIENT_LABELS = [
  /^para[:\s]/i,
  /^destino[:\s]/i,
  /^favorecido[:\s]/i,
  /^recebedor[:\s]/i,
  /^benefici[aá]rio[:\s]/i,
  /^nome[:\s]/i,
];

const PIX_KEYWORDS = /\bpix\b/i;
const PIX_CONTEXT = /transfer[eê]ncia|enviado|recebido|comprovante|pagamento|pago/i;

const E2E_PATTERN = /\bE[A-Z0-9]{31,32}\b/i;

const TRANSACTION_LABELS = [
  /id\s*da\s*transa[cç][aã]o[:\s]*([A-Z0-9]+)/i,
  /identificador[:\s]*([A-Z0-9]+)/i,
  /autentica[cç][aã]o[:\s]*([A-Z0-9]+)/i,
  /c[oó]digo\s*da\s*transa[cç][aã]o[:\s]*([A-Z0-9]+)/i,
];

const AMOUNT_PATTERNS = [
  /(?:valor(?:\s*pago|\s*transferido|\s*enviado)?|total|quantia)[:\s]*R?\$?\s*([\d.,]+)/i,
  /R\$\s*([\d.,]+)/i,
];

/**
 * @param {unknown} value
 * @returns {number}
 */
export function parseProofAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * @param {string} text
 * @returns {number}
 */
function extractAmount(text) {
  const source = String(text || "");
  for (const pattern of AMOUNT_PATTERNS) {
    const match = source.match(pattern);
    if (match?.[1]) {
      const amount = parseProofAmount(match[1]);
      if (amount > 0) return amount;
    }
  }
  return 0;
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractRecipientName(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of RECIPIENT_LABELS) {
      if (label.test(line)) {
        const inline = line.replace(label, "").trim();
        if (inline.length >= 3 && !/^\d+$/.test(inline)) return inline;
        const next = lines[i + 1]?.trim() || "";
        if (next.length >= 3 && !/^\d+$/.test(next)) return next;
      }
    }
  }

  return "";
}

/**
 * @param {string} text
 * @returns {string}
 */
function extractTransactionId(text) {
  const source = String(text || "");

  const e2e = source.match(E2E_PATTERN);
  if (e2e?.[0]) return e2e[0].toUpperCase();

  for (const pattern of TRANSACTION_LABELS) {
    const match = source.match(pattern);
    if (match?.[1] && match[1].length >= 8) return match[1].toUpperCase();
  }

  return "";
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function detectPixReceipt(text) {
  const source = String(text || "");
  if (!PIX_KEYWORDS.test(source)) return false;
  return PIX_CONTEXT.test(source);
}

/**
 * @param {string} text
 * @returns {number}
 */
function scoreReceiptConfidence(text, amount, recipientName, transactionId) {
  let score = 0;
  const source = String(text || "").toLowerCase();

  if (detectPixReceipt(text)) score += 0.35;
  if (amount > 0) score += 0.3;
  if (recipientName) score += 0.2;
  if (transactionId) score += 0.15;
  if (/nubank|itau|bradesco|inter|picpay|caixa|santander|bb\b|banco do brasil/.test(source)) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * @param {string} text
 * @returns {{
 *   amount: number,
 *   recipientName: string,
 *   transactionId: string,
 *   isPixReceipt: boolean,
 *   receiptConfidence: number,
 *   source: "ocr"
 * } | null}
 */
export function parsePixProofFromText(text) {
  const raw = String(text || "").trim();
  if (raw.length < 10) return null;

  const amount = extractAmount(raw);
  const recipientName = extractRecipientName(raw);
  const transactionId = extractTransactionId(raw);
  const isPixReceipt = detectPixReceipt(raw);
  const receiptConfidence = scoreReceiptConfidence(raw, amount, recipientName, transactionId);

  return {
    amount,
    recipientName,
    transactionId,
    isPixReceipt,
    receiptConfidence,
    source: "ocr",
  };
}
