import { NextResponse } from "next/server";
import {
  extractMessageText,
  flattenWebhookMessageEntries,
  jidToDialable,
  hasAudioAttachment,
} from "@/lib/whatsapp-message";
import { getCatalogoBase64 } from "@/lib/catalogo-media";
import { readDb, updateDb } from "@/lib/simple-db";
import { parseCurrencyToNumber, formatBRL } from "@/lib/currency";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { handleUnknownInActiveFlow } from "@/lib/flow-router";
import {
  processSchedulingFlows,
  startClientDataFlow,
  askClientName,
  startFaqFlow,
} from "@/lib/flows/flow-registry";
import { sendToSecretaries, getSecretaryNumbers } from "@/lib/secretary-notify";
import { hasSchedulingFlow, clearSchedulingFlows } from "@/lib/flows/flow-store";
import { isInPixFlow } from "@/lib/flows/pix-flow";
import { muteNumberInDraft, resolveHandoffMutes } from "@/lib/handoff-mute";
import { hasPixProofMedia } from "@/lib/message-media";
import {
  isAwaitingHumanChoice,
  parseHumanHandoffChoice,
  executeHumanHandoff,
  resetConfusion,
  processConfusionReply,
  HUMAN_OFFER_BLOCK,
} from "@/lib/human-handoff";
import { detectFlowContext, getFlowReminderMessage } from "@/lib/flow-context";
import { resolveOriginFromInstance } from "@/lib/managed-numbers";
import { resolveInboundNumber } from "@/lib/evolution-jid";
import {
  hydrateInteractionMaps,
  persistMainMenu,
  persistCatalogAreas,
  persistPostQuote,
  persistHandoffAreas,
  persistHandoffPhotos,
  clearMenuFlow,
  clearInteraction,
} from "@/lib/flow-interaction-store";

const DEFAULT_WELCOME_MESSAGE = `Fala, meu amigo! Tudo certo? 🤝
Aqui é o Matheus Brizza, especialista em Neo Tribal e Geométrico 🔥
Também trabalho com Fine Line, Blackwork e outros estilos.
Vamos tirar sua ideia do papel com um projeto brabo! 🎯`;
const DEFAULT_PROJECT_PROMPT = "Me conta: qual é o tipo do seu projeto? 👇";
const OPTION_NEW_TATTOO = "projeto_nova_tattoo";
const OPTION_REFORM = "projeto_reformar";
const OPTION_COMPLEMENT = "projeto_complementar";
const DEFAULT_CATALOG_PROMPT =
  "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) ✍️";
const SELECTOR_TEXT_FALLBACK =
  "Escolha uma opção pelo número 👇\n1 - Nova Tattoo 🆕\n2 - Reformar ♻️\n3 - Complementar 🧩";
const pendingPollByMessageId = new Map();
const pendingPollByNumber = new Map();
const recentCatalogByNumber = new Map();
const pendingCatalogAreasByNumber = new Map();
const pendingPostQuoteChoiceByNumber = new Map();
const pendingHandoffAreasByNumber = new Map();
const pendingHandoffPhotosByNumber = new Map();
const recentBotOutboundTextByNumber = new Map();
const recentBotOutboundMediaByNumber = new Map();
const QUOTE_VALIDITY_DAYS = 7;
const MENU_TTL_MS = 24 * 60 * 60 * 1000;

function getInteractionMaps() {
  return {
    pendingPollByNumber,
    pendingCatalogAreasByNumber,
    pendingPostQuoteChoiceByNumber,
    pendingHandoffAreasByNumber,
    pendingHandoffPhotosByNumber,
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeBase(url) {
  if (!url || typeof url !== "string") return "";
  return url.replace(/\/+$/, "");
}

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeForCompare(text) {
  return String(text || "").trim().toLowerCase();
}

/**
 * @param {string} number
 * @param {string} text
 */
function rememberBotOutboundText(number, text) {
  const normalized = normalizeForCompare(text);
  if (!normalized) return;
  const current = Array.isArray(recentBotOutboundTextByNumber.get(number))
    ? recentBotOutboundTextByNumber.get(number)
    : [];
  const now = Date.now();
  const next = [
    ...current.filter((item) => now - item.at < 5 * 60_000),
    { text: normalized, at: now },
  ].slice(-20);
  recentBotOutboundTextByNumber.set(number, next);
}

/**
 * @param {string} number
 */
function rememberBotOutboundMedia(number) {
  recentBotOutboundMediaByNumber.set(number, Date.now());
}

/**
 * @param {string} number
 * @returns {boolean}
 */
function hasActiveFlow(number, db) {
  return (
    isAwaitingHumanChoice(number) ||
    hasPendingPoll(number) ||
    pendingCatalogAreasByNumber.has(number) ||
    pendingPostQuoteChoiceByNumber.has(number) ||
    pendingHandoffAreasByNumber.has(number) ||
    pendingHandoffPhotosByNumber.has(number) ||
    hasSchedulingFlow(db, number)
  );
}

/**
 * @param {string} number
 */
async function clearFlowState(number) {
  await clearMenuFlow(number, getInteractionMaps());
  await clearSchedulingFlows(number);
}

/**
 * @param {string} number
 * @param {string} text
 * @param {boolean} hasMedia
 * @returns {boolean}
 */
function isLikelyBotMessage(number, text, hasMedia) {
  const normalized = normalizeForCompare(text);
  const now = Date.now();
  if (normalized) {
    const candidates = Array.isArray(recentBotOutboundTextByNumber.get(number))
      ? recentBotOutboundTextByNumber.get(number)
      : [];
    const match = candidates.some(
      (item) => item.text === normalized && now - item.at < 5 * 60_000,
    );
    if (match) return true;
  }
  if (hasMedia) {
    const recentMediaAt = recentBotOutboundMediaByNumber.get(number);
    if (typeof recentMediaAt === "number" && now - recentMediaAt < 2 * 60_000) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 * @param {string} clientName
 * @param {object} quoteContext
 */
async function beginAgendarFlow(baseUrl, instance, apiKey, number, clientName, quoteContext, pricingTable) {
  resetConfusion(number);
  pendingPollByNumber.delete(number);
  pendingPostQuoteChoiceByNumber.delete(number);
  await registerLeadOutcome({
    number,
    clientName,
    outcome: "confirmed_schedule",
    selectedAreas: quoteContext.selectedAreas || [],
    estimatedTotal: quoteContext.estimatedTotal || 0,
    quoteIssuedAt: quoteContext.quoteIssuedAt || null,
    quoteExpiresAt: quoteContext.quoteExpiresAt || null,
    instance: quoteContext.instance || "",
  });
  await startClientDataFlow(quoteContext, number, clientName, quoteContext.instance || "", pricingTable);
  await askClientName(
    (n, text) => sendText(baseUrl, instance, apiKey, n, text),
    number,
    clientName,
  );
}

function getFlowMemory() {
  return {
    pendingPostQuoteChoiceByNumber,
    pendingCatalogAreasByNumber,
    pendingHandoffAreasByNumber,
    pendingHandoffPhotosByNumber,
    pendingPollByNumber,
    hasPendingPoll,
  };
}

/**
 * @param {number} choice
 * @param {object} params
 * @returns {Promise<boolean>}
 */
async function applyPostQuoteChoice(choice, params) {
  const {
    evolutionBase,
    instance,
    apiKey,
    number,
    clientName,
    selectedAreas,
    estimatedTotal,
    quoteIssuedAtMs,
    quoteExpiresAtMs,
    pricingTable,
  } = params;

  if (choice === 1) {
    await beginAgendarFlow(
      evolutionBase,
      instance,
      apiKey,
      number,
      clientName,
      {
        selectedAreas,
        estimatedTotal,
        quoteIssuedAt: toIso(quoteIssuedAtMs),
        quoteExpiresAt: toIso(quoteExpiresAtMs),
        instance,
      },
      pricingTable,
    );
    return true;
  }

  if (choice === 2) {
    pendingPollByNumber.delete(number);
    pendingPostQuoteChoiceByNumber.delete(number);
    await registerLeadOutcome({
      number,
      clientName,
      outcome: "question_no_schedule",
      selectedAreas,
      estimatedTotal,
      quoteIssuedAt: toIso(quoteIssuedAtMs),
      quoteExpiresAt: toIso(quoteExpiresAtMs),
      instance,
    });
    await startFaqFlow(
      {
        selectedAreas,
        estimatedTotal,
        quoteIssuedAt: toIso(quoteIssuedAtMs),
        quoteExpiresAt: toIso(quoteExpiresAtMs),
        instance,
      },
      number,
      clientName,
      instance,
      (n, msg) => sendText(evolutionBase, instance, apiKey, n, msg),
    );
    return true;
  }

  return false;
}

/**
 * @param {string} text
 * @returns {number[]}
 */
function extractAreaNumbers(text) {
  const matches = String(text || "").match(/\d+/g) || [];
  const values = matches
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(values)];
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 * @param {object} db
 * @param {object} settings
 * @param {string} handoffNumber
 * @param {string} text
 * @param {object | null} message
 * @param {object | null} key
 * @param {string} clientName
 * @returns {Promise<boolean>}
 */
async function trySchedulingFlows(
  baseUrl,
  instance,
  apiKey,
  number,
  db,
  settings,
  text,
  message,
  key,
  clientName,
  pricingTable,
) {
  const send = (n, msg) => sendText(baseUrl, instance, apiKey, n, msg);
  return processSchedulingFlows({
    number,
    text,
    db,
    message,
    key,
    clientName,
    settings,
    pricingTable,
    evolutionBase: baseUrl,
    instance,
    apiKey,
    sendText: send,
  });
}

/**
 * @param {number} daysFromNow
 * @returns {string}
 */
function getValidityDateLabel(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

/**
 * @param {Record<string, unknown>} entry
 * @param {Record<string, unknown> | null} key
 * @returns {string}
 */
function extractClientName(entry, key) {
  const candidates = [
    entry?.pushName,
    entry?.senderPushName,
    entry?.notifyName,
    key?.pushName,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "Cliente";
}

/**
 * @param {Record<string, unknown> | null} message
 * @returns {boolean}
 */
function hasImageAttachment(message) {
  return hasPixProofMedia(message);
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 * @param {string} text
 */
async function sendText(baseUrl, instance, apiKey, number, text) {
  const target = `${normalizeBase(baseUrl)}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({ number, text }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error("[webhook] sendText falhou", res.status, errBody);
  }
  if (res.ok) rememberBotOutboundText(number, text);
  return res.ok;
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 */
async function sendProjectSelector(baseUrl, instance, apiKey, number) {
  const sent = await sendText(baseUrl, instance, apiKey, number, SELECTOR_TEXT_FALLBACK);
  if (!sent) {
    return { ok: false, messageId: "" };
  }
  return { ok: true, messageId: "" };
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 */
async function sendCatalog(baseUrl, instance, apiKey, number) {
  let media = "";
  try {
    media = getCatalogoBase64();
  } catch (error) {
    console.error("[webhook] catalogo.jpeg indisponivel", error);
    return false;
  }

  if (!media || media.length < 100) {
    console.warn("[webhook] catalogo base64 vazio ou invalido", { length: media?.length || 0 });
    return false;
  }

  const target = `${normalizeBase(baseUrl)}/message/sendMedia/${encodeURIComponent(instance)}`;
  const payload = {
    number,
    mediatype: "image",
    mimetype: "image/jpeg",
    media,
    caption: "Catálogo de localizações",
    fileName: "catalogo.jpeg",
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      rememberBotOutboundMedia(number);
      markCatalogSent(number);
      console.log("[webhook] catalogo enviado", { number, attempt, bytes: media.length });
      return true;
    }

    const errBody = await res.text();
    console.warn("[webhook] sendMedia falhou", {
      status: res.status,
      attempt,
      bytes: media.length,
      errBody: errBody.slice(0, 300),
    });
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return false;
}

/**
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 */
async function sendCatalogFlow(baseUrl, instance, apiKey, number, catalogPrompt) {
  const imageSent = await sendCatalog(baseUrl, instance, apiKey, number);
  if (!imageSent) {
    console.warn("[webhook] catalogo nao enviado; seguindo com texto", { number });
  }
  await sendText(baseUrl, instance, apiKey, number, catalogPrompt);
}

/**
 * @param {string} number
 * @param {"reformar" | "complementar"} projectType
 * @param {string} handoffNumber
 * @param {number[]} selectedAreas
 * @param {number} estimatedTotal
 * @param {boolean} hasPhotos
 */
async function markLeadForHandoff(
  number,
  projectType,
  handoffNumber,
  selectedAreas,
  estimatedTotal,
  hasPhotos,
  instance = "",
) {
  const db = await readDb();
  const origin = resolveOriginFromInstance(instance, db.settings?.managedNumbers);
  await updateDb((draft) => {
    draft.leads.unshift({
      number,
      projectType,
      handoffNumber,
      selectedAreas: Array.isArray(selectedAreas) ? selectedAreas : [],
      estimatedTotal: Number.isFinite(estimatedTotal) ? estimatedTotal : 0,
      hasPhotos: Boolean(hasPhotos),
      originNumber: origin.number,
      originNumberName: origin.name,
      createdAt: new Date().toISOString(),
      status: "pending_handoff",
    });
    draft.leads = draft.leads.slice(0, 200);
    return draft;
  });
  console.log("[webhook] lead_handoff_marked", {
    number,
    projectType,
    handoffNumber,
    selectedAreas,
    estimatedTotal,
    hasPhotos,
    status: "pending_handoff",
  });
}

/**
 * @param {object} payload
 * @param {string} payload.number
 * @param {string} payload.clientName
 * @param {"confirmed_schedule" | "question_no_schedule" | "left_for_later"} payload.outcome
 * @param {number[]} payload.selectedAreas
 * @param {number} payload.estimatedTotal
 */
async function registerLeadOutcome(payload) {
  const db = await readDb();
  const origin = resolveOriginFromInstance(payload.instance, db.settings?.managedNumbers);
  await updateDb((draft) => {
    draft.leadOutcomes.unshift({
      number: payload.number,
      clientName: payload.clientName,
      outcome: payload.outcome,
      selectedAreas: payload.selectedAreas,
      estimatedTotal: payload.estimatedTotal,
      quoteIssuedAt: payload.quoteIssuedAt || null,
      quoteExpiresAt: payload.quoteExpiresAt || null,
      expiryNoticeSentAt: payload.expiryNoticeSentAt || null,
      instance: payload.instance || "",
      originNumber: origin.number,
      originNumberName: origin.name,
      createdAt: new Date().toISOString(),
    });
    draft.leadOutcomes = draft.leadOutcomes.slice(0, 500);
    return draft;
  });
}

/**
 * @param {number} timestampMs
 * @returns {string}
 */
function toIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}

/**
 * @param {string} number
 * @param {string} reason
 */
async function muteBotForLead(number, reason) {
  await updateDb((draft) => {
    muteNumberInDraft(draft, number, reason);
    return draft;
  });
  console.log("[webhook] lead_muted_for_bot", { number, reason, muteDays: 7 });
}

/**
 * @param {"reformar" | "complementar"} projectType
 * @returns {"reforma" | "complemento"}
 */
function getPricingFieldByProjectType(projectType) {
  return projectType === "reformar" ? "reforma" : "complemento";
}

/**
 * @param {"reformar" | "complementar"} projectType
 * @returns {string}
 */
function getProjectTypeLabel(projectType) {
  return projectType === "reformar" ? "Reforma" : "Complemento";
}

/**
 * @param {unknown} pollUpdates
 */
function hasNewTattooVote(pollUpdates) {
  if (!Array.isArray(pollUpdates)) return false;
  return pollUpdates.some((item) => {
    if (!item || typeof item !== "object") return false;
    const name = String(item.name || item.optionName || "");
    return name.includes("Nova Tattoo") || name.includes("Novo");
  });
}

/**
 * @param {string} number
 * @returns {boolean}
 */
function recentlySentCatalog(number) {
  const now = Date.now();
  const previous = recentCatalogByNumber.get(number);
  return typeof previous === "number" && now - previous < 60_000;
}

function markCatalogSent(number) {
  recentCatalogByNumber.set(number, Date.now());
}

/**
 * @param {string} number
 * @returns {boolean}
 */
function hasPendingPoll(number) {
  const timestamp = pendingPollByNumber.get(number);
  if (typeof timestamp !== "number") return false;
  // Expira pendência para evitar disparos tardios de eventos não relacionados.
  if (Date.now() - timestamp > MENU_TTL_MS) {
    pendingPollByNumber.delete(number);
    return false;
  }
  return true;
}

/**
 * A Evolution pode entregar pollUpdates em formatos diferentes por versão.
 * @param {Record<string, unknown>} update
 */
function getPollUpdates(update) {
  if (Array.isArray(update.pollUpdates)) return update.pollUpdates;
  if (update.update && typeof update.update === "object") {
    const nested = /** @type {Record<string, unknown>} */ (update.update);
    if (Array.isArray(nested.pollUpdates)) return nested.pollUpdates;
    if (nested.message && typeof nested.message === "object") {
      const nestedMsg = /** @type {Record<string, unknown>} */ (nested.message);
      if (Array.isArray(nestedMsg.pollUpdates)) return nestedMsg.pollUpdates;
    }
  }
  if (update.message && typeof update.message === "object") {
    const msg = /** @type {Record<string, unknown>} */ (update.message);
    if (Array.isArray(msg.pollUpdates)) return msg.pollUpdates;
  }
  return [];
}

/**
 * @param {Record<string, unknown>} update
 * @returns {string}
 */
function extractUpdateNumber(update) {
  const key = update.key && typeof update.key === "object" ? /** @type {Record<string, unknown>} */ (update.key) : null;
  const candidates = [];
  if (key) {
    if (typeof key.remoteJid === "string") candidates.push(key.remoteJid);
    if (typeof key.remoteJidAlt === "string") candidates.push(key.remoteJidAlt);
    if (typeof key.participant === "string") candidates.push(key.participant);
  }
  if (typeof update.remoteJid === "string") candidates.push(update.remoteJid);
  if (typeof update.participant === "string") candidates.push(update.participant);

  for (const candidate of candidates) {
    if (!candidate.endsWith("@s.whatsapp.net")) continue;
    const dialable = jidToDialable(candidate);
    if (dialable) return dialable;
  }
  return "";
}

/**
 * @param {Record<string, unknown>} update
 */
function updateLooksLikeNewTattooVote(update) {
  const pollUpdates = getPollUpdates(update);
  if (hasNewTattooVote(pollUpdates)) return true;
  const raw = JSON.stringify(update).toLowerCase();
  return raw.includes("nova tattoo") || raw.includes("🆕");
}

/**
 * @param {Record<string, unknown>} update
 */
function updateLooksLikePollInteraction(update) {
  const pollUpdates = getPollUpdates(update);
  if (Array.isArray(pollUpdates) && pollUpdates.length > 0) return true;
  const raw = JSON.stringify(update).toLowerCase();
  return raw.includes("poll") || raw.includes("enquete");
}

/**
 * @param {Record<string, unknown> | null} message
 * @returns {string}
 */
function extractInteractiveSelection(message) {
  if (!message || typeof message !== "object") return "";
  const templateButtonReply =
    message.templateButtonReplyMessage && typeof message.templateButtonReplyMessage === "object"
      ? /** @type {Record<string, unknown>} */ (message.templateButtonReplyMessage)
      : null;
  const selectedId =
    typeof templateButtonReply?.selectedId === "string" ? templateButtonReply.selectedId : "";
  if (selectedId) return selectedId;

  const listResponse =
    message.listResponseMessage && typeof message.listResponseMessage === "object"
      ? /** @type {Record<string, unknown>} */ (message.listResponseMessage)
      : null;
  const singleSelectReply =
    listResponse?.singleSelectReply && typeof listResponse.singleSelectReply === "object"
      ? /** @type {Record<string, unknown>} */ (listResponse.singleSelectReply)
      : null;
  const selectedRowId =
    typeof singleSelectReply?.selectedRowId === "string" ? singleSelectReply.selectedRowId : "";
  if (selectedRowId) return selectedRowId;

  const buttonsResponse =
    message.buttonsResponseMessage && typeof message.buttonsResponseMessage === "object"
      ? /** @type {Record<string, unknown>} */ (message.buttonsResponseMessage)
      : null;
  const selectedButtonId =
    typeof buttonsResponse?.selectedButtonId === "string" ? buttonsResponse.selectedButtonId : "";
  if (selectedButtonId) return selectedButtonId;

  const interactiveResponse =
    message.interactiveResponseMessage && typeof message.interactiveResponseMessage === "object"
      ? /** @type {Record<string, unknown>} */ (message.interactiveResponseMessage)
      : null;
  const nativeFlowResponse =
    interactiveResponse?.nativeFlowResponseMessage &&
    typeof interactiveResponse.nativeFlowResponseMessage === "object"
      ? /** @type {Record<string, unknown>} */ (interactiveResponse.nativeFlowResponseMessage)
      : null;
  const paramsJson =
    typeof nativeFlowResponse?.paramsJson === "string" ? nativeFlowResponse.paramsJson : "";
  if (paramsJson) {
    try {
      const parsed = JSON.parse(paramsJson);
      if (typeof parsed?.id === "string") return parsed.id;
      if (typeof parsed?.selectedId === "string") return parsed.selectedId;
      if (typeof parsed?.selectedRowId === "string") return parsed.selectedRowId;
    } catch {
      // Ignora payload invalido e tenta outros formatos.
    }
  }

  return "";
}

/**
 * @param {Record<string, unknown> | null} message
 * @returns {string}
 */
function extractAnySelectedValue(message) {
  if (!message || typeof message !== "object") return "";
  const stack = [message];
  const seen = new Set();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") {
        const loweredKey = key.toLowerCase();
        if (
          loweredKey.includes("selected") ||
          loweredKey === "id" ||
          loweredKey.endsWith("id") ||
          loweredKey.includes("rowid") ||
          loweredKey.includes("buttonid")
        ) {
          return value;
        }
      } else if (value && typeof value === "object") {
        stack.push(/** @type {Record<string, unknown>} */ (value));
      }
    }
  }
  return "";
}

/**
 * @returns {string}
 */
function getSinglePendingPollNumber() {
  const now = Date.now();
  const valid = [];
  for (const [number, timestamp] of pendingPollByNumber.entries()) {
    if (typeof timestamp !== "number") continue;
    if (now - timestamp > MENU_TTL_MS) {
      pendingPollByNumber.delete(number);
      continue;
    }
    valid.push(number);
  }
  return valid.length === 1 ? valid[0] : "";
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const event = String(body?.event || "");
  const normalized = event.toUpperCase().replace(/\./g, "_");
  if (!["MESSAGES_UPSERT", "MESSAGES_UPDATE"].includes(normalized)) {
    return new NextResponse("ok", { status: 200 });
  }

  const instance = typeof body.instance === "string" ? body.instance : "";
  const serverUrl =
    typeof body.server_url === "string"
      ? body.server_url
      : typeof body.serverUrl === "string"
        ? body.serverUrl
        : "";

  const evolutionBase =
    process.env.EVOLUTION_BASE_URL?.trim() || normalizeBase(serverUrl) || "";

  const apiKey =
    process.env.EVOLUTION_GLOBAL_API_KEY?.trim() ||
    (typeof body.apikey === "string" ? body.apikey : "");

  if (!instance || !evolutionBase || !apiKey) {
    console.warn("[webhook] Faltando instance, EVOLUTION_BASE_URL/server_url ou chave api");
    return new NextResponse("ok", { status: 200 });
  }

  const db = await readDb();
  hydrateInteractionMaps(db, getInteractionMaps());
  const handoffNumber = db?.settings?.handoffNumber?.trim() || "";
  const settings = db?.settings || {};
  const welcomeMessage =
    db?.settings?.welcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE;
  const projectPrompt =
    db?.settings?.projectPrompt?.trim() || DEFAULT_PROJECT_PROMPT;
  const catalogPrompt =
    db?.settings?.catalogPrompt?.trim() || DEFAULT_CATALOG_PROMPT;
  const pricingTable = Array.isArray(db?.pricing) ? db.pricing : [];
  const mutedLeadNumbers = await resolveHandoffMutes(db, updateDb);

  if (normalized === "MESSAGES_UPDATE") {
    const dataList = Array.isArray(body.data) ? body.data : [body.data];
    for (const update of dataList) {
      if (!update || typeof update !== "object") continue;
      const key = update.key && typeof update.key === "object" ? update.key : null;
      if (!key) continue;

      const pollId = typeof key.id === "string" ? key.id : "";
      const directMapKey = pollId ? `${instance}:${pollId}` : "";
      const mappedNumber = directMapKey ? pendingPollByMessageId.get(directMapKey) : "";
      const updateObj = /** @type {Record<string, unknown>} */ (update);
      const updateNumber = extractUpdateNumber(updateObj);
      const matchedNewTattoo = updateLooksLikeNewTattooVote(updateObj);
      const fallbackPendingNumber =
        !mappedNumber && !updateNumber ? getSinglePendingPollNumber() : "";
      const number = mappedNumber || updateNumber || fallbackPendingNumber;
      if (!number) continue;
      const matchedPendingPoll = hasPendingPoll(number) && updateLooksLikePollInteraction(updateObj);
      console.log("[webhook] messages_update", {
        number,
        pollId,
        matchedNewTattoo,
        matchedPendingPoll,
      });
      if (!matchedNewTattoo && !matchedPendingPoll) continue;
      if (recentlySentCatalog(number)) continue;

      await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
      pendingPollByNumber.delete(number);
      if (directMapKey) pendingPollByMessageId.delete(directMapKey);
    }
    return new NextResponse("ok", { status: 200 });
  }

  const entries = flattenWebhookMessageEntries(body.data);
  for (const entry of entries) {
    const key = entry.key && typeof entry.key === "object" ? /** @type {Record<string, unknown>} */ (entry.key) : null;
    if (!key) continue;

    const number = await resolveInboundNumber(
      key,
      /** @type {Record<string, unknown>} */ (entry),
      { baseUrl: evolutionBase, instance, apiKey },
    );
    if (!number) continue;
    if (mutedLeadNumbers.has(number)) {
      console.log("[webhook] muted_number_ignored", { number });
      continue;
    }
    const clientName = extractClientName(
      /** @type {Record<string, unknown>} */ (entry),
      key,
    );

    const message = entry.message && typeof entry.message === "object" ? entry.message : null;
    const interactiveSelectionRaw = extractInteractiveSelection(
      message ? /** @type {Record<string, unknown>} */ (message) : null,
    );
    const interactiveSelectionFallback = extractAnySelectedValue(
      message ? /** @type {Record<string, unknown>} */ (message) : null,
    );
    const interactiveSelection = (interactiveSelectionRaw || interactiveSelectionFallback).toLowerCase();
    const text = extractMessageText(message).trim();
    const normalizedText = text.toLowerCase();
    const hasPhotoInMessage = hasImageAttachment(
      message ? /** @type {Record<string, unknown>} */ (message) : null,
    );

    if (key.fromMe === true) {
      if (hasActiveFlow(number, db)) {
        const likelyBot = isLikelyBotMessage(number, text, hasPhotoInMessage);
        if (!likelyBot) {
          await muteBotForLead(number, "human_takeover_mid_flow");
          await clearFlowState(number);
          console.log("[webhook] human_takeover_detected", { number });
        }
      }
      continue;
    }
    console.log("[webhook] upsert_inbound", {
      number,
      hasText: Boolean(text),
      textPreview: text.slice(0, 60),
      interactiveSelectionRaw,
      interactiveSelectionFallback,
      hasPendingSelector: hasPendingPoll(number),
      hasPixMedia: hasPhotoInMessage,
      inPixFlow: isInPixFlow(db, number),
    });

    if (
      hasAudioAttachment(message ? /** @type {Record<string, unknown>} */ (message) : null) &&
      !isInPixFlow(db, number)
    ) {
      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        "No momento ainda não consigo ouvir áudios 🎙️\nPor favor, envie sua mensagem por texto.",
      );
      continue;
    }

    if (isAwaitingHumanChoice(number) && normalizedText) {
      const humanChoice = await parseHumanHandoffChoice(normalizedText);
      const send = (n, msg) => sendText(evolutionBase, instance, apiKey, n, msg);

      if (humanChoice === "yes") {
        await executeHumanHandoff({
          number,
          clientName,
          db,
          settings,
          memory: getFlowMemory(),
          lastMessage: text,
          instance,
          sendText: send,
          clearFlows: () => clearFlowState(number),
        });
        continue;
      }

      if (humanChoice === "no") {
        resetConfusion(number);
        const ctx = detectFlowContext(db, number, getFlowMemory());
        await sendText(
          evolutionBase,
          instance,
          apiKey,
          number,
          `Sem problemas! Vamos continuar. 👇\n\n${getFlowReminderMessage(ctx)}`,
        );
        continue;
      }

      await sendText(evolutionBase, instance, apiKey, number, HUMAN_OFFER_BLOCK);
      continue;
    }

    if (hasSchedulingFlow(db, number) || isInPixFlow(db, number)) {
      const schedulingHandled = await trySchedulingFlows(
        evolutionBase,
        instance,
        apiKey,
        number,
        db,
        settings,
        text,
        message,
        key,
        clientName,
        pricingTable,
      );
      if (schedulingHandled) continue;
    }

    const latestOutcomeForNumber = (Array.isArray(db?.leadOutcomes) ? db.leadOutcomes : []).find(
      (item) => item?.number === number,
    );
    const hasExpiredNonScheduledOutcome =
      (latestOutcomeForNumber?.outcome === "question_no_schedule" ||
        latestOutcomeForNumber?.outcome === "left_for_later") &&
      typeof latestOutcomeForNumber?.quoteExpiresAt === "string" &&
      Date.now() >= new Date(latestOutcomeForNumber.quoteExpiresAt).getTime();

    if (
      !hasActiveFlow(number, db) &&
      hasExpiredNonScheduledOutcome
    ) {
      const reactivateChoice = await resolveOptionChoice({
        state: "pos_orcamento_expirado",
        options: [{ id: 1, label: "Agendar" }],
        userMessage: normalizedText,
      });
      if (reactivateChoice === 1) {
        const selectedAreas = Array.isArray(latestOutcomeForNumber?.selectedAreas)
          ? latestOutcomeForNumber.selectedAreas
          : [];
        const estimatedTotal =
          typeof latestOutcomeForNumber?.estimatedTotal === "number"
            ? latestOutcomeForNumber.estimatedTotal
            : 0;
        await beginAgendarFlow(evolutionBase, instance, apiKey, number, clientName, {
          selectedAreas,
          estimatedTotal,
          quoteIssuedAt: latestOutcomeForNumber?.quoteIssuedAt || null,
          quoteExpiresAt: latestOutcomeForNumber?.quoteExpiresAt || null,
          instance,
        }, pricingTable);
        continue;
      }
    }

    if (
      !hasActiveFlow(number, db) &&
      hasExpiredNonScheduledOutcome &&
      !latestOutcomeForNumber?.expiryNoticeSentAt
    ) {
      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        "Seu orçamento expirou hoje 🗓️\nSe você ainda quiser esse projeto, responda AGENDAR para reservar sua data.",
      );
      await updateDb((draft) => {
        const found = (draft.leadOutcomes || []).find(
          (item) =>
            item?.number === number &&
            item?.createdAt === latestOutcomeForNumber?.createdAt,
        );
        if (found) {
          found.expiryNoticeSentAt = new Date().toISOString();
        }
        return draft;
      });
      continue;
    }

    if (pendingPostQuoteChoiceByNumber.has(number) && (normalizedText || interactiveSelection)) {
      const quoteContext = pendingPostQuoteChoiceByNumber.get(number) || {};
      const selectedAreas = Array.isArray(quoteContext.selectedAreas)
        ? quoteContext.selectedAreas
        : [];
      const estimatedTotal =
        typeof quoteContext.estimatedTotal === "number" ? quoteContext.estimatedTotal : 0;
      const quoteIssuedAtMs =
        typeof quoteContext.quoteIssuedAtMs === "number" ? quoteContext.quoteIssuedAtMs : Date.now();
      const quoteExpiresAtMs =
        typeof quoteContext.quoteExpiresAtMs === "number"
          ? quoteContext.quoteExpiresAtMs
          : quoteIssuedAtMs + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

      const postQuoteChoice = await resolveOptionChoice({
        state: "pos_orcamento",
        options: [
          { id: 1, label: "Agendar" },
          { id: 2, label: "Tirar dúvida" },
        ],
        userMessage: normalizedText || interactiveSelection,
      });

      const postQuoteParams = {
        evolutionBase,
        instance,
        apiKey,
        number,
        clientName,
        selectedAreas,
        estimatedTotal,
        quoteIssuedAtMs,
        quoteExpiresAtMs,
        pricingTable,
      };

      if (postQuoteChoice !== null && (await applyPostQuoteChoice(postQuoteChoice, postQuoteParams))) {
        resetConfusion(number);
        continue;
      }

      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        processConfusionReply(number, getFlowReminderMessage({ step: "post_quote_choice" })),
      );
      continue;
    }

    if (pendingHandoffAreasByNumber.has(number) && normalizedText) {
      const handoffContext = pendingHandoffAreasByNumber.get(number);
      const projectType =
        handoffContext?.projectType === "reformar" ? "reformar" : "complementar";
      const selectedAreas = extractAreaNumbers(normalizedText);
      if (selectedAreas.length === 0) {
        await sendText(
          evolutionBase,
          instance,
          apiKey,
          number,
          processConfusionReply(
            number,
            "Não consegui identificar os números das áreas. Me envie apenas os números (ex: 2, 6 e 9).",
          ),
        );
        continue;
      }

      const pricingField = getPricingFieldByProjectType(projectType);
      const areaRows = selectedAreas.map((area) => {
        const match = pricingTable.find((row) => Number(row?.area) === area);
        const rawPrice = String(match?.[pricingField] || "");
        const numeric = parseCurrencyToNumber(rawPrice);
        return { area, rawPrice, numeric };
      });
      const total = areaRows.reduce((sum, row) => sum + row.numeric, 0);
      const breakdown = areaRows
        .map((row) => {
          const display = row.rawPrice ? row.rawPrice : "sob consulta";
          return `• Área ${row.area}: ${display}`;
        })
        .join("\n");

      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        `Perfeito, ${clientName}! ✅\nSe quiser, você pode me enviar fotos da tattoo atual para ajudar na avaliação do especialista 📸\nSe preferir seguir sem foto, é só responder normalmente que eu continuo.`,
      );
      pendingHandoffAreasByNumber.delete(number);
      const handoffPhotoData = {
        projectType,
        selectedAreas,
        total,
        breakdown,
        capturedAt: Date.now(),
      };
      await persistHandoffPhotos(number, handoffPhotoData, getInteractionMaps());
      await clearInteraction(number, "handoff_areas");
      continue;
    }

    if (pendingHandoffPhotosByNumber.has(number)) {
      const photoContext = pendingHandoffPhotosByNumber.get(number) || {};
      const projectType =
        photoContext?.projectType === "reformar" ? "reformar" : "complementar";
      const selectedAreas = Array.isArray(photoContext?.selectedAreas)
        ? photoContext.selectedAreas
        : [];
      const total = typeof photoContext?.total === "number" ? photoContext.total : 0;
      const breakdown = typeof photoContext?.breakdown === "string" ? photoContext.breakdown : "";
      const informedNoPhoto = /^(sem foto|sem fotos|nao tenho foto|não tenho foto)$/.test(normalizedText);
      const hasPhotos = hasPhotoInMessage && !informedNoPhoto;
      const secretaryNumbers = getSecretaryNumbers(settings);
      await markLeadForHandoff(
        number,
        projectType,
        secretaryNumbers[0] || "",
        selectedAreas,
        total,
        hasPhotos,
        instance,
      );

      const origin = resolveOriginFromInstance(instance, settings.managedNumbers);
      const originLine = origin.name
        ? `Linha de atendimento: ${origin.name} (${origin.number})`
        : origin.number
          ? `Linha de atendimento: ${origin.number}`
          : "Origem: Bot Briza Tattoo";

      const leadSummary = `🚨 Novo lead para assumir
Tipo: ${getProjectTypeLabel(projectType)}
Cliente: ${clientName}
WhatsApp cliente: ${number}
Fotos da tattoo atual: ${hasPhotos ? "SIM (enviadas no chat do cliente)" : "NÃO"}

Áreas solicitadas:
${breakdown}

Total estimado inicial: ${formatBRL(total)}
${originLine}

Ação recomendada:
1) Entrar em contato com o cliente
2) Confirmar detalhes da arte
3) Fechar proposta final e agendamento`;

      if (secretaryNumbers.length) {
        await sendToSecretaries(
          (n, msg) => sendText(evolutionBase, instance, apiKey, n, msg),
          settings,
          leadSummary,
        );
      }
      await muteBotForLead(number, "handoff_started");

      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        secretaryNumbers.length
          ? `Perfeito, ${clientName}! ✅\nRecebi tudo e já encaminhei seu atendimento para o especialista responsável.\nEle vai assumir essa conversa com você em breve.`
          : `Perfeito, ${clientName}! ✅\nRecebi tudo e já deixei seu lead pronto para o especialista assumir a conversa.`,
      );

      pendingHandoffPhotosByNumber.delete(number);
      pendingPollByNumber.delete(number);
      pendingCatalogAreasByNumber.delete(number);
      pendingPostQuoteChoiceByNumber.delete(number);
      continue;
    }

    if (pendingCatalogAreasByNumber.has(number) && normalizedText) {
      const selectedAreas = extractAreaNumbers(normalizedText);
      if (selectedAreas.length === 0) {
        await sendText(
          evolutionBase,
          instance,
          apiKey,
          number,
          processConfusionReply(
            number,
            "Não consegui identificar os números das áreas. Me envie apenas os números (ex: 1, 4 e 7).",
          ),
        );
        continue;
      }

      const areaRows = selectedAreas.map((area) => {
        const match = pricingTable.find((row) => Number(row?.area) === area);
        const rawPrice = String(match?.tattooNova || "");
        const numeric = parseCurrencyToNumber(rawPrice);
        return { area, rawPrice, numeric };
      });
      const total = areaRows.reduce((sum, row) => sum + row.numeric, 0);
      const validityDate = getValidityDateLabel(QUOTE_VALIDITY_DAYS);
      const breakdown = areaRows
        .map((row) => {
          const display = row.rawPrice ? row.rawPrice : "sob consulta";
          return `• Área ${row.area}: ${display}`;
        })
        .join("\n");

      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        `Fechado, ${clientName}! 🔥\nCom base nas áreas que você marcou, montei seu orçamento personalizado:\n\n${breakdown}\n\n💰 Total estimado: ${formatBRL(total)}\n🗓️ Validade deste orçamento: até ${validityDate} (${QUOTE_VALIDITY_DAYS} dias)\n\nEsse é um valor base para o estilo Tattoo Nova. No atendimento final, a gente ajusta tamanho, detalhes e encaixe da arte pra fechar certinho no seu projeto.`,
      );
      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        "Me diz como quer seguir:\n1 - Agendar 📅\n2 - Tirar dúvida 💬\n\n🚀 Para travar sua data, responda: AGENDAR",
      );
      pendingCatalogAreasByNumber.delete(number);
      const quoteIssuedAtMs = Date.now();
      const postQuoteData = {
        createdAt: quoteIssuedAtMs,
        quoteIssuedAtMs,
        quoteExpiresAtMs: quoteIssuedAtMs + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
        selectedAreas,
        estimatedTotal: total,
      };
      await persistPostQuote(number, postQuoteData, getInteractionMaps());
      await clearInteraction(number, "catalog_areas");
      resetConfusion(number);
      continue;
    }

    if (hasPendingPoll(number) && (normalizedText || interactiveSelection)) {
      let menuChoice = null;
      if (interactiveSelection === OPTION_NEW_TATTOO) menuChoice = 1;
      else if (interactiveSelection === OPTION_REFORM) menuChoice = 2;
      else if (interactiveSelection === OPTION_COMPLEMENT) menuChoice = 3;
      else {
        menuChoice = await resolveOptionChoice({
          state: "menu_principal",
          options: [
            { id: 1, label: "Nova Tattoo" },
            { id: 2, label: "Reformar" },
            { id: 3, label: "Complementar" },
          ],
          userMessage: normalizedText || interactiveSelection,
        });
      }

      if (menuChoice === 1 || normalizedText.includes("nova tattoo") || normalizedText === "novo" || normalizedText === "nova") {
        resetConfusion(number);
        await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
        pendingPollByNumber.delete(number);
        await clearInteraction(number, "main_menu");
        await persistCatalogAreas(number, getInteractionMaps());
        continue;
      }
      if (menuChoice === 2) {
        await sendCatalog(evolutionBase, instance, apiKey, number);
        await sendText(
          evolutionBase,
          instance,
          apiKey,
          number,
          "Perfeito! Para reforma, me envie os números das áreas da imagem (ex: 2, 6 e 9) para eu encaminhar seu lead completo ao especialista. ♻️",
        );
        await persistHandoffAreas(
          number,
          { projectType: "reformar", createdAt: Date.now() },
          getInteractionMaps(),
        );
        pendingPollByNumber.delete(number);
        await clearInteraction(number, "main_menu");
        pendingHandoffPhotosByNumber.delete(number);
        pendingPostQuoteChoiceByNumber.delete(number);
        await clearInteraction(number, "post_quote");
        continue;
      }
      if (menuChoice === 3) {
        await sendCatalog(evolutionBase, instance, apiKey, number);
        await sendText(
          evolutionBase,
          instance,
          apiKey,
          number,
          "Boa! Para complemento, me envie os números das áreas da imagem (ex: 3, 7 e 10) para eu encaminhar seu lead completo ao especialista. 🧩",
        );
        await persistHandoffAreas(
          number,
          { projectType: "complementar", createdAt: Date.now() },
          getInteractionMaps(),
        );
        pendingPollByNumber.delete(number);
        await clearInteraction(number, "main_menu");
        pendingHandoffPhotosByNumber.delete(number);
        pendingPostQuoteChoiceByNumber.delete(number);
        await clearInteraction(number, "post_quote");
        continue;
      }

      await sendText(
        evolutionBase,
        instance,
        apiKey,
        number,
        processConfusionReply(number, getFlowReminderMessage({ step: "main_menu" })),
      );
      continue;
    }

    if (
      interactiveSelection === OPTION_NEW_TATTOO ||
      normalizedText.includes("nova tattoo") ||
      normalizedText === "novo" ||
      normalizedText === "nova"
    ) {
      await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
      pendingPollByNumber.delete(number);
      await clearInteraction(number, "main_menu");
      await persistCatalogAreas(number, getInteractionMaps());
      continue;
    }

    if (!text && !hasPhotoInMessage) continue;

    if (normalizedText.includes("nova tattoo") || normalizedText === "novo") {
      await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
      await persistCatalogAreas(number, getInteractionMaps());
      continue;
    }

    if (hasActiveFlow(number, db)) {
      const flowResult = await handleUnknownInActiveFlow({
        db,
        number,
        userMessage: normalizedText || interactiveSelection,
        memory: getFlowMemory(),
      });

      if (flowResult.optionId !== undefined && flowResult.flowContext?.step === "post_quote_choice") {
        const quoteContext = pendingPostQuoteChoiceByNumber.get(number) || {};
        const selectedAreas = Array.isArray(quoteContext.selectedAreas) ? quoteContext.selectedAreas : [];
        const estimatedTotal =
          typeof quoteContext.estimatedTotal === "number" ? quoteContext.estimatedTotal : 0;
        const quoteIssuedAtMs =
          typeof quoteContext.quoteIssuedAtMs === "number" ? quoteContext.quoteIssuedAtMs : Date.now();
        const quoteExpiresAtMs =
          typeof quoteContext.quoteExpiresAtMs === "number"
            ? quoteContext.quoteExpiresAtMs
            : quoteIssuedAtMs + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

        if (
          await applyPostQuoteChoice(flowResult.optionId, {
            evolutionBase,
            instance,
            apiKey,
            number,
            clientName,
            selectedAreas,
            estimatedTotal,
            quoteIssuedAtMs,
            quoteExpiresAtMs,
            pricingTable,
          })
        ) {
          continue;
        }
      }

      if (flowResult.reminder) {
        await sendText(evolutionBase, instance, apiKey, number, flowResult.reminder);
      }
      continue;
    }

    const sentWelcome = await sendText(evolutionBase, instance, apiKey, number, welcomeMessage);
    if (!sentWelcome) continue;

    await sendText(evolutionBase, instance, apiKey, number, projectPrompt);
    const selectorResult = await sendProjectSelector(evolutionBase, instance, apiKey, number);
    if (selectorResult.ok && selectorResult.messageId) {
      pendingPollByMessageId.set(`${instance}:${selectorResult.messageId}`, number);
    }
    if (selectorResult.ok) {
      await persistMainMenu(number, getInteractionMaps());
    } else {
      await sendText(evolutionBase, instance, apiKey, number, SELECTOR_TEXT_FALLBACK);
    }
  }

  return new NextResponse("ok", { status: 200 });
}
