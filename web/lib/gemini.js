import { parseSlotRequestLocal } from "@/lib/slot-filters";
import { parseProofAmount } from "@/lib/pix-proof-parser";
import { formatFaqKnowledgeForPrompt } from "@/lib/faq-tattoo-tribal";

export const PIX_RECEIPT_MIN_CONFIDENCE = 0.35;

const TIMEZONE = "America/Sao_Paulo";
const DEFAULT_MODEL = "auto";

/**
 * @returns {{ baseUrl: string, model: string, apiKey: string } | null}
 */
function getAiConfig() {
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return null;
  return {
    baseUrl,
    model: process.env.AI_MODEL?.trim() || DEFAULT_MODEL,
    apiKey: process.env.AI_API_KEY?.trim() || "",
  };
}

function todayLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function isQuotaError(error) {
  const status = error?.status ?? error?.statusCode;
  const message = String(error?.message || "");
  return status === 429 || message.includes("429") || message.includes("quota") || message.includes("Quota exceeded");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extrai texto da resposta OpenAI-compatible.
 * @param {unknown} data
 * @returns {string}
 */
function extractMessageContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

/**
 * Parse JSON tolerante a fences markdown.
 * @param {string} text
 * @returns {unknown}
 */
function parseJsonContent(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("empty_response");
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("invalid_json");
  }
}

/**
 * @param {{
 *   messages: Array<object>,
 *   json?: boolean,
 *   model?: string,
 * }} options
 * @returns {Promise<{ text: string, modelUsed: string }>}
 */
async function chatCompletion({ messages, json = false, model } = {}) {
  const config = getAiConfig();
  if (!config) {
    const err = new Error("ai_not_configured");
    err.status = 0;
    throw err;
  }

  const modelName = model || config.model;
  const headers = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: modelName,
    messages,
  };
  if (json) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const err = new Error(
      data?.error?.message || data?.message || `HTTP ${response.status}: ${rawText.slice(0, 200)}`,
    );
    err.status = response.status;
    err.statusCode = response.status;
    throw err;
  }

  const text = extractMessageContent(data);
  if (!text) {
    throw new Error("empty_completion");
  }

  return {
    text,
    modelUsed: data?.model || modelName,
  };
}

/**
 * @param {string} prompt
 * @param {{ json?: boolean }} [opts]
 */
async function completeText(prompt, opts = {}) {
  return chatCompletion({
    messages: [{ role: "user", content: prompt }],
    json: Boolean(opts.json),
  });
}

export async function parseUserIntent(context, userMessage) {
  return parseFlowIntent(context, userMessage);
}

export async function parseFlowIntent(flowContext, userMessage) {
  if (!getAiConfig()) return null;

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
    const result = await completeText(prompt, { json: true });
    const parsed = parseJsonContent(result.text);
    return {
      action: String(parsed?.action || "unknown"),
      optionId: typeof parsed?.optionId === "number" ? parsed.optionId : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[omniroute] parseFlowIntent falhou", error);
    return null;
  }
}

export async function parseSlotRequest(userMessage, scheduling) {
  const local = parseSlotRequestLocal(userMessage);
  if (local) return local;

  if (!getAiConfig()) return null;

  const daysAhead = Number(scheduling?.daysAhead) || 14;
  const prompt = `Hoje: ${todayLabel()}
Timezone: ${TIMEZONE}
Máximo de dias à frente: ${daysAhead}
Mensagem: "${userMessage}"

JSON: {"intent":"pick_option"|"refine_dates"|"show_more"|"unknown","optionId":null,"dateStart":null,"dateEnd":null,"weekdays":[],"confidence":0.9}`;

  try {
    const result = await completeText(prompt, { json: true });
    const parsed = parseJsonContent(result.text);
    return {
      intent: String(parsed?.intent || "unknown"),
      optionId: typeof parsed?.optionId === "number" ? parsed.optionId : null,
      dateStart: parsed?.dateStart || null,
      dateEnd: parsed?.dateEnd || null,
      weekdays: Array.isArray(parsed?.weekdays) ? parsed.weekdays.map(Number) : [],
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[omniroute] parseSlotRequest falhou", error);
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

  if (!getAiConfig()) return null;

  const prompt = `WhatsApp: ${whatsappNumber}
Mensagem: "${userMessage}"
JSON: {"useSameNumber":true|false,"phone":"<digitos ou null>","confidence":0.9}`;

  try {
    const result = await completeText(prompt, { json: true });
    const parsed = parseJsonContent(result.text);
    return {
      useSameNumber: Boolean(parsed?.useSameNumber),
      phone: parsed?.phone ? String(parsed.phone).replace(/\D/g, "") : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[omniroute] parsePhoneResponse falhou", error);
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

/**
 * @param {string} prompt
 * @param {string} base64
 * @param {string} mimeType
 * @param {string} modelName
 */
async function generatePixProofWithModel(prompt, base64, mimeType, modelName) {
  const mime = mimeType || "image/jpeg";
  const result = await chatCompletion({
    model: modelName,
    json: true,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${mime};base64,${base64}` },
          },
        ],
      },
    ],
  });
  return {
    parsed: parseJsonContent(result.text),
    modelUsed: result.modelUsed,
  };
}

export async function extractPixProofFromImage(base64, mimeType, expectedContext = {}) {
  const config = getAiConfig();
  if (!config || !base64) return { error: "no_client" };

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

  const maxAttempts = 2;

  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const { parsed, modelUsed } = await generatePixProofWithModel(
        prompt,
        base64,
        mimeType,
        config.model,
      );
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
        modelUsed,
      };
    } catch (error) {
      console.error(`[omniroute] extractPixProofFromImage falhou (tentativa ${i + 1})`, error);

      if (isQuotaError(error)) {
        if (i < maxAttempts - 1) {
          await sleep(2000);
          continue;
        }
        return { error: "quota" };
      }

      if (i < maxAttempts - 1) {
        await sleep(1000);
        continue;
      }
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

export async function answerTattooFaq(question, quoteContext = {}, faqEntries) {
  if (!getAiConfig()) return null;

  const kb = formatFaqKnowledgeForPrompt(faqEntries);
  const prompt = `Assistente de estúdio de tattoo (WhatsApp, português BR). Resposta curta (máx 4 frases).
Use APENAS a base de conhecimento abaixo. Se a pergunta não couber nela, responda exatamente: NAO_SEI

Base de conhecimento:
${kb}

Orçamento atual: ${quoteContext.estimatedTotal || "N/A"} | Áreas: ${(quoteContext.selectedAreas || []).join(", ") || "N/A"}
Pergunta do cliente: ${question}`;

  try {
    const result = await completeText(prompt, { json: false });
    const text = result.text.trim();
    if (!text || /^NAO_SEI\b/i.test(text)) return null;
    return text;
  } catch (error) {
    console.error("[omniroute] answerTattooFaq falhou", error);
    return null;
  }
}

/**
 * Interpreta mensagem fora do script local dentro de um fluxo ativo.
 * @param {object} flowContext
 * @param {string} userMessage
 * @param {{ quoteContext?: object, faqEntries?: unknown }} [extra]
 */
export async function interpretInFlowMessage(flowContext, userMessage, extra = {}) {
  if (!getAiConfig()) return null;

  const kb = formatFaqKnowledgeForPrompt(extra.faqEntries);
  const quoteContext = extra.quoteContext || {};
  const options = Array.isArray(flowContext?.options) ? flowContext.options : [];

  const prompt = `Você é o copiloto de um chatbot de tattoo no WhatsApp (português BR).
Classifique a mensagem do cliente DENTRO do passo atual. Não invente dados fora da base.

Estado: ${flowContext?.state || "unknown"}
Passo: ${flowContext?.step || ""}
Descrição: ${flowContext?.description || ""}
Opções: ${JSON.stringify(options)}
Orçamento: ${quoteContext.estimatedTotal ?? "N/A"} | Áreas: ${(quoteContext.selectedAreas || []).join(", ") || "N/A"}

Base de dúvidas (painel):
${kb}

Exemplos:
- "claro", "lógico", "pode ser", "fechado" com opção sim → equivalent_answer mappedValue "yes"
- "nah", "negativo" → equivalent_answer mappedValue "no"
- "quero agendar" / "bora marcar" → want_schedule
- pergunta sobre dor/sessão/cuidados coberta na base → ask_question knowsAnswer true + answer
- pergunta sem cobertura na base → ask_question knowsAnswer false
- "não entendi" / "como assim" → confused
- assunto totalmente fora → out_of_scope

Mensagem: "${userMessage}"

Responda APENAS JSON:
{
  "intent": "equivalent_answer"|"ask_question"|"want_schedule"|"confused"|"out_of_scope",
  "mappedOptionId": null,
  "mappedValue": "yes"|"no"|null,
  "answer": null,
  "knowsAnswer": false,
  "guideHint": null,
  "confidence": 0.0
}`;

  try {
    const result = await completeText(prompt, { json: true });
    const parsed = parseJsonContent(result.text);
    return {
      intent: String(parsed?.intent || "confused"),
      mappedOptionId: typeof parsed?.mappedOptionId === "number" ? parsed.mappedOptionId : null,
      mappedValue: parsed?.mappedValue ? String(parsed.mappedValue) : null,
      answer: parsed?.answer ? String(parsed.answer).trim() : null,
      knowsAnswer: Boolean(parsed?.knowsAnswer),
      guideHint: parsed?.guideHint ? String(parsed.guideHint).trim() : null,
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0,
    };
  } catch (error) {
    console.error("[omniroute] interpretInFlowMessage falhou", error);
    return null;
  }
}

export function isGeminiConfigured() {
  return Boolean(process.env.AI_BASE_URL?.trim() || process.env.GEMINI_API_KEY?.trim());
}
