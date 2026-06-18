import { stripBase64Prefix } from "@/lib/message-media";
import { parsePixProofFromText } from "@/lib/pix-proof-parser";
import { extractPixProofFromImage, isGeminiConfigured } from "@/lib/gemini";

const OCR_TIMEOUT_MS = 15000;
const PDF_MIN_TEXT_LENGTH = 80;
const MAX_IMAGE_DIMENSION = 1600;

/** @type {import("tesseract.js").Worker | null} */
let tesseractWorker = null;
/** @type {Promise<import("tesseract.js").Worker> | null} */
let tesseractInitPromise = null;

/**
 * @param {string} base64
 * @returns {Buffer}
 */
function bufferFromBase64(base64) {
  return Buffer.from(stripBase64Prefix(base64), "base64");
}

/**
 * @param {Buffer} buffer
 * @returns {Promise<Buffer>}
 */
async function preprocessImage(buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .grayscale()
    .normalize()
    .sharpen()
    .png()
    .toBuffer();
}

/**
 * @returns {Promise<import("tesseract.js").Worker>}
 */
async function getTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;
  if (!tesseractInitPromise) {
    tesseractInitPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por+eng", 1, {
        logger: () => {},
      });
      tesseractWorker = worker;
      return worker;
    })();
  }
  return tesseractInitPromise;
}

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>}
 */
async function runTesseract(imageBuffer) {
  const worker = await getTesseractWorker();
  const task = worker.recognize(imageBuffer);

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("ocr_timeout")), OCR_TIMEOUT_MS);
  });

  const result = await Promise.race([task, timeout]);
  return String(result?.data?.text || "").trim();
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>}
 */
async function extractPdfText(pdfBuffer) {
  try {
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const parsed = await pdfParse(pdfBuffer);
    return String(parsed?.text || "").trim();
  } catch (error) {
    console.warn("[pix-proof] pdf-parse falhou", error?.message || error);
    return "";
  }
}

/**
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Buffer | null>}
 */
async function renderPdfFirstPage(pdfBuffer) {
  try {
    const { pdf } = await import("pdf-to-img");
    const doc = await pdf(pdfBuffer, { scale: 2 });
    if (!doc.length) return null;
    return doc.getPage(1);
  } catch (error) {
    console.warn("[pix-proof] pdf-to-img falhou", error?.message || error);
    return null;
  }
}

/**
 * @param {string} mimeType
 * @returns {boolean}
 */
function isPdfMime(mimeType) {
  return String(mimeType || "")
    .trim()
    .toLowerCase()
    .startsWith("application/pdf");
}

/**
 * @param {object | null} ocr
 * @param {object | null} gemini
 * @param {string} expectedHolderName
 * @returns {object}
 */
export function mergeProofResults(ocr, gemini, expectedHolderName = "") {
  const ocrResult = ocr && typeof ocr === "object" ? ocr : null;
  const geminiResult =
    gemini && typeof gemini === "object" && !gemini.error ? gemini : null;

  if (!ocrResult && !geminiResult) {
    if (gemini?.error === "quota") return { error: "quota" };
    if (gemini?.error) return { error: gemini.error };
    return { error: "no_data" };
  }

  const amount =
    ocrResult?.amount > 0 ? ocrResult.amount : geminiResult?.amount > 0 ? geminiResult.amount : 0;

  const recipientName = ocrResult?.recipientName || geminiResult?.recipientName || "";
  const transactionId = ocrResult?.transactionId || geminiResult?.transactionId || "";

  const isPixReceipt = Boolean(ocrResult?.isPixReceipt || geminiResult?.isPixReceipt);

  let receiptConfidence = Math.max(
    ocrResult?.receiptConfidence || 0,
    geminiResult?.receiptConfidence || 0,
  );

  if (ocrResult?.isPixReceipt && geminiResult?.isPixReceipt) {
    receiptConfidence = Math.min(1, receiptConfidence + 0.15);
  }

  let verificationSource = "gemini";
  if (ocrResult && geminiResult) verificationSource = "both";
  else if (ocrResult) verificationSource = "ocr";

  const nameMatchesExpected = geminiResult?.nameMatchesExpected
    ? Boolean(geminiResult.nameMatchesExpected)
    : false;

  const nameMatchConfidence =
    typeof geminiResult?.nameMatchConfidence === "number" ? geminiResult.nameMatchConfidence : 0;

  const confidence =
    typeof geminiResult?.confidence === "number"
      ? Math.max(geminiResult.confidence, receiptConfidence)
      : receiptConfidence;

  return {
    isPixReceipt,
    receiptConfidence,
    recipientName,
    nameMatchesExpected,
    nameMatchConfidence,
    amount,
    transactionId,
    confidence,
    verificationSource,
    modelUsed: geminiResult?.modelUsed || null,
    expectedHolderName,
  };
}

/**
 * @param {{ base64: string, mimetype: string, expectedHolderName?: string }} params
 * @returns {Promise<object>}
 */
export async function analyzePixProof({ base64, mimetype, expectedHolderName = "" }) {
  const startedAt = Date.now();
  if (!base64) return { error: "no_data" };

  const rawBuffer = bufferFromBase64(base64);
  let ocrText = "";
  let imageBuffer = null;
  let processedBuffer = null;
  let ocrMs = 0;
  let geminiMs = 0;

  try {
    if (isPdfMime(mimetype)) {
      ocrText = await extractPdfText(rawBuffer);
      if (ocrText.length < PDF_MIN_TEXT_LENGTH) {
        imageBuffer = await renderPdfFirstPage(rawBuffer);
      }
    } else {
      imageBuffer = rawBuffer;
    }

    if (imageBuffer) {
      processedBuffer = await preprocessImage(imageBuffer);
      const ocrStarted = Date.now();
      try {
        const tesseractText = await runTesseract(processedBuffer);
        ocrText = [ocrText, tesseractText].filter(Boolean).join("\n");
      } catch (error) {
        console.warn("[pix-proof] tesseract falhou", error?.message || error);
      }
      ocrMs = Date.now() - ocrStarted;
    }

    const ocrResult = parsePixProofFromText(ocrText);

    let geminiResult = null;
    if (isGeminiConfigured()) {
      const geminiMime = isPdfMime(mimetype) ? "image/png" : mimetype || "image/jpeg";
      const geminiBase64 = processedBuffer
        ? processedBuffer.toString("base64")
        : stripBase64Prefix(base64);

      const geminiStarted = Date.now();
      geminiResult = await extractPixProofFromImage(geminiBase64, geminiMime, {
        pixHolderName: expectedHolderName,
      });
      geminiMs = Date.now() - geminiStarted;
    }

    const merged = mergeProofResults(ocrResult, geminiResult, expectedHolderName);

    console.log("[pix-proof] análise concluída", {
      source: merged.verificationSource,
      ocrMs,
      geminiMs,
      totalMs: Date.now() - startedAt,
      amount: merged.amount,
      transactionId: merged.transactionId,
      receiptConfidence: merged.receiptConfidence,
      isPixReceipt: merged.isPixReceipt,
    });

    return merged;
  } catch (error) {
    console.error("[pix-proof] pipeline falhou", error);
    return { error: "pipeline" };
  }
}
