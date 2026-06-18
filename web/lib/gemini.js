import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseSlotRequestLocal } from "@/lib/slot-filters";
import { parseProofAmount } from "@/lib/pix-proof-parser";

export const PIX_RECEIPT_MIN_CONFIDENCE = 0.35;

const MODEL_TEXT = "gemini-2.0-flash";
const MODEL_VISION = "gemini-2.0-flash";
const MODEL_VISION_FALLBACK = "gemini-1.5-flash";
const TIMEZONE = "America/Sao_Paulo";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function todayLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

export async function parseUserIntent(context, userMessage) {
  return parseFlowIntent(context, userMessage);
}

export async function parseFlowIntent(flowContext, userMessage) {
  const client = getClient();
  if (!client) return null;

  const model = client.getGenerativeModel({
    model: MODEL_TEXT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const state = String(flowContext?.state || "unknown");
  const step = flowContext?.step || "";
  const description = flowContext?.description || "";
  const options = Array.isArray(flowContext?.options) ? flowContext.options : [];

  const prompt = `Você interpreta mensagens de clientes em um chatbot de estúdio de tattoo no WhatsApp (português BR).
NUNCA reinicie o fluxo. Identifique a intenção DENTRO do passo atual.

Estado: ${state}
Passo: ${step}
Contexto: ${description}
Opções disponíveis (se houver): ${JSON.stringify(options)}
Mensagem do cliente: "${userMessage}"

Exemplos pos_orcamento:
- "quero agendar pfv", "bora marcar", "vamos agendar" → optionId 1 (Agendar)
- "tenho uma dúvida", "quero tirar duvida" → optionId 2 (Tirar dúvida)

Exemplos menu_principal:
- "quero uma tattoo nova", "nova" → optionId 1
- "reformar", "cover up" → optionId 2
- "complementar", "completar" → optionId 3

Responda APENAS JSON:
{"action":"select_option"|"provide_data"|"unknown","optionId":<número ou null>,"confidence":<0 a 1>}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return {
      action: String(parsed?.action || "unknown"),
      optionId: typeof parsed?.optionId === "number" ? parsed.optionId : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[gemini] parseFlowIntent falhou", error);
    return null;
  }
}

export async function parseSlotRequest(userMessage, scheduling) {
  const local = parseSlotRequestLocal(userMessage);
  if (local) return local;

  const client = getClient();
  if (!client) return null;

  const daysAhead = Number(scheduling?.daysAhead) || 14;
  const model = client.getGenerativeModel({
    model: MODEL_TEXT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `Hoje: ${todayLabel()}
Timezone: ${TIMEZONE}
Máximo de dias à frente: ${daysAhead}
Mensagem: "${userMessage}"

JSON: {"intent":"pick_option"|"refine_dates"|"show_more"|"unknown","optionId":null,"dateStart":null,"dateEnd":null,"weekdays":[],"confidence":0.9}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return {
      intent: String(parsed?.intent || "unknown"),
      optionId: typeof parsed?.optionId === "number" ? parsed.optionId : null,
      dateStart: parsed?.dateStart || null,
      dateEnd: parsed?.dateEnd || null,
      weekdays: Array.isArray(parsed?.weekdays) ? parsed.weekdays.map(Number) : [],
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[gemini] parseSlotRequest falhou", error);
    return null;
  }
}

export async function parsePhoneResponse(userMessage, whatsappNumber) {
  const normalized = String(userMessage || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (/^(mesmo|esse|este|igual|whatsapp|e o mesmo|e o mesmo numero|e esse numero|pode ser esse|pode ser o mesmo)/.test(normalized)) {
    return { useSameNumber: true, phone: whatsappNumber, confidence: 1 };
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13) {
    return { useSameNumber: false, phone: digits, confidence: 0.9 };
  }

  const client = getClient();
  if (!client) return null;

  const model = client.getGenerativeModel({
    model: MODEL_TEXT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `WhatsApp: ${whatsappNumber}
Mensagem: "${userMessage}"
JSON: {"useSameNumber":true|false,"phone":"<digitos ou null>","confidence":0.9}`;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    return {
      useSameNumber: Boolean(parsed?.useSameNumber),
      phone: parsed?.phone ? String(parsed.phone).replace(/\D/g, "") : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[gemini] parsePhoneResponse falhou", error);
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseProofAmountLocal(value) {
  return parseProofAmount(value);
}

function isQuotaError(error) {
  const status = error?.status ?? error?.statusCode;
  const message = String(error?.message || "");
  return status === 429 || message.includes("429") || message.includes("quota") || message.includes("Quota exceeded");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generatePixProofWithModel(client, modelName, prompt, base64, mimeType) {
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });
  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType: mimeType || "image/jpeg" } },
  ]);
  return JSON.parse(result.response.text().trim());
}

export async function extractPixProofFromImage(base64, mimeType, expectedContext = {}) {
  const client = getClient();
  if (!client || !base64) return { error: "no_client" };

  const expectedName = expectedContext.pixHolderName || "";

  const prompt = `Você analisa imagens de comprovantes de pagamento PIX no Brasil.

Tarefa 1 — Parece comprovante PIX?
Decida se a imagem é um comprovante real de transferência PIX (Nubank, Itaú, Bradesco, Inter, PicPay, etc.).
Não precisa ser perfeito; rejeite só se claramente não for comprovante (selfie, catálogo, print irrelevante).

Tarefa 2 — Nome do recebedor
Extraia o nome completo de quem RECEBEU (campos "Destino", "Para", "Favorecido", "Recebedor").
Compare com o nome cadastrado: "${expectedName || "não informado"}"
Defina nameMatchesExpected=true se o nome do comprovante for claramente a mesma pessoa (aceite variações de ordem, acentos e nomes parciais compatíveis).

NÃO analise nem extraia chave PIX — bancos frequentemente não exibem.

Extraia também amount (valor em reais, decimal) e transactionId (ID E2E da transação PIX, ex: E1234..., ou campo "ID da transação").

Responda APENAS JSON:
{
  "isPixReceipt": true,
  "receiptConfidence": 0.95,
  "recipientName": "Nome Completo",
  "nameMatchesExpected": true,
  "nameMatchConfidence": 0.9,
  "amount": 75.00,
  "transactionId": "E12345678901234567890123456789012",
  "confidence": 0.9
}`;

  const modelsToTry = [MODEL_VISION, MODEL_VISION_FALLBACK];

  for (let i = 0; i < modelsToTry.length; i += 1) {
    const modelName = modelsToTry[i];
    try {
      const parsed = await generatePixProofWithModel(client, modelName, prompt, base64, mimeType);
      const receiptConfidence =
        typeof parsed?.receiptConfidence === "number" ? parsed.receiptConfidence : 0;
      const nameMatchConfidence =
        typeof parsed?.nameMatchConfidence === "number" ? parsed.nameMatchConfidence : 0;
      const overallConfidence =
        typeof parsed?.confidence === "number"
          ? parsed.confidence
          : Math.min(receiptConfidence, nameMatchConfidence);

      return {
        isPixReceipt: Boolean(parsed?.isPixReceipt),
        receiptConfidence,
        recipientName: String(parsed?.recipientName || "").trim(),
        nameMatchesExpected: Boolean(parsed?.nameMatchesExpected),
        nameMatchConfidence,
        amount: parseProofAmountLocal(parsed?.amount),
        transactionId: String(parsed?.transactionId || "").trim().toUpperCase(),
        confidence: overallConfidence,
        modelUsed: modelName,
      };
    } catch (error) {
      console.error(`[gemini] extractPixProofFromImage falhou (${modelName})`, error);

      if (isQuotaError(error)) {
        if (i < modelsToTry.length - 1) {
          await sleep(2000);
          continue;
        }
        return { error: "quota" };
      }

      if (i < modelsToTry.length - 1) continue;
      return { error: "api" };
    }
  }

  return { error: "api" };
}

export async function extractPixAmountFromImage(base64, mimeType) {
  const proof = await extractPixProofFromImage(base64, mimeType);
  if (!proof || proof.error) return null;
  return { amount: proof.amount, confidence: proof.confidence, rawText: "" };
}

export async function answerTattooFaq(question, quoteContext) {
  const client = getClient();
  if (!client) return null;

  const model = client.getGenerativeModel({ model: MODEL_TEXT });
  const prompt = `Assistente tattoo Neo Tribal. Resposta curta em português (máx 4 frases).
Orçamento: ${quoteContext.estimatedTotal || "N/A"} | Áreas: ${(quoteContext.selectedAreas || []).join(", ")}
Pergunta: ${question}`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("[gemini] answerTattooFaq falhou", error);
    return null;
  }
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}
