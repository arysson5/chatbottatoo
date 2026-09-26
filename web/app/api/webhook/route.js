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
import { handleUnknownInActiveFlow, resolveUnexpectedMessage } from "@/lib/flow-router";
import {
  processSchedulingFlows,
  startClientDataFlow,
  askClientName,
  startFaqFlow,
} from "@/lib/flows/flow-registry";
import { sendToSecretaries, getSecretaryNumbers } from "@/lib/secretary-notify";
import { hasSchedulingFlow, clearSchedulingFlows, getPendingSchedule, removePendingSchedule } from "@/lib/flows/flow-store";
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
import {
  applyFlowNavigation,
  getPendingNavConfirm,
  resolveNavConfirmReply,
} from "@/lib/flow-navigation";
import {
  resolveOriginFromInstance,
  isManagedInstance,
  extractInstanceDigits,
} from "@/lib/managed-numbers";
import { makeScopeKey, parseScopeKey } from "@/lib/scope-key";
import { resolveInboundNumber } from "@/lib/evolution-jid";
import {
  hydrateInteractionMaps,
  persistMainMenu,
  persistCatalogAreas,
  persistCatalogAreasConfirm,
  persistPostQuote,
  persistHandoffAreas,
  persistHandoffAreasConfirm,
  persistHandoffPhotos,
  clearMenuFlow,
  clearInteraction,
} from "@/lib/flow-interaction-store";
import {
  resolveAreaSelection,
  buildAreaConfirmMessage,
  isAreaConfirmationAffirmative,
} from "@/lib/pricing-areas";
import {
  filterInboundEntries,
  markMessageSeen,
  extractMessageId,
  shouldSendWelcome,
  markWelcomeSent,
  tryAcquireChatLock,
  releaseChatLock,
  withOutboundRateLimit,
  createOutboundCap,
} from "@/lib/webhook-guard";
import {
  markMessageAsRead,
  sendPresence,
  rejectCall,
  softReconnectInstance,
  extractConnectionState,
  evolutionFetchWithTimeout,
} from "@/lib/evolution-bot-ops";

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
const pendingCatalogAreaConfirmByNumber = new Map();
const pendingPostQuoteChoiceByNumber = new Map();
const pendingHandoffAreasByNumber = new Map();
const pendingHandoffAreaConfirmByNumber = new Map();
const pendingHandoffPhotosByNumber = new Map();
const recentBotOutboundTextByNumber = new Map();
const recentBotOutboundMediaByNumber = new Map();
const QUOTE_VALIDITY_DAYS = 7;
const MENU_TTL_MS = 24 * 60 * 60 * 1000;

function getInteractionMaps() {
  return {
    pendingPollByNumber,
    pendingCatalogAreasByNumber,
    pendingCatalogAreaConfirmByNumber,
    pendingPostQuoteChoiceByNumber,
    pendingHandoffAreasByNumber,
    pendingHandoffAreaConfirmByNumber,
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
 * @param {string} [instance]
 */
function rememberBotOutboundText(number, text, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  const normalized = normalizeForCompare(text);
  if (!normalized) return;
  const current = Array.isArray(recentBotOutboundTextByNumber.get(scopeKey))
    ? recentBotOutboundTextByNumber.get(scopeKey)
    : [];
  const now = Date.now();
  const next = [
    ...current.filter((item) => now - item.at < 5 * 60_000),
    { text: normalized, at: now },
  ].slice(-20);
  recentBotOutboundTextByNumber.set(scopeKey, next);
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
function rememberBotOutboundMedia(number, instance = "") {
  recentBotOutboundMediaByNumber.set(makeScopeKey(instance, number), Date.now());
}

/**
 * @param {string} number
 * @param {object} db
 * @param {string} [instance]
 * @returns {boolean}
 */
function hasActiveFlow(number, db, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  return (
    isAwaitingHumanChoice(number, instance) ||
    hasPendingPoll(number, instance) ||
    pendingCatalogAreasByNumber.has(scopeKey) ||
    pendingCatalogAreaConfirmByNumber.has(scopeKey) ||
    pendingPostQuoteChoiceByNumber.has(scopeKey) ||
    pendingHandoffAreasByNumber.has(scopeKey) ||
    pendingHandoffAreaConfirmByNumber.has(scopeKey) ||
    pendingHandoffPhotosByNumber.has(scopeKey) ||
    hasSchedulingFlow(db, number, instance)
  );
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
async function clearFlowState(number, instance = "") {
  await clearMenuFlow(number, getInteractionMaps(), instance);
  await clearSchedulingFlows(number, instance);
}

/**
 * @param {string} number
 * @param {string} text
 * @param {boolean} hasMedia
 * @param {string} [instance]
 * @returns {boolean}
 */
function isLikelyBotMessage(number, text, hasMedia, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  const normalized = normalizeForCompare(text);
  const now = Date.now();
  if (normalized) {
    const candidates = Array.isArray(recentBotOutboundTextByNumber.get(scopeKey))
      ? recentBotOutboundTextByNumber.get(scopeKey)
      : [];
    const match = candidates.some(
      (item) => item.text === normalized && now - item.at < 5 * 60_000,
    );
    if (match) return true;
  }
  if (hasMedia) {
    const recentMediaAt = recentBotOutboundMediaByNumber.get(scopeKey);
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
  const scopeKey = makeScopeKey(instance, number);
  resetConfusion(number, instance);
  pendingPollByNumber.delete(scopeKey);
  pendingPostQuoteChoiceByNumber.delete(scopeKey);
  await registerLeadOutcome({
    number,
    clientName,
    outcome: "confirmed_schedule",
    selectedAreas: quoteContext.selectedAreas || [],
    estimatedTotal: quoteContext.estimatedTotal || 0,
    quoteIssuedAt: quoteContext.quoteIssuedAt || null,
    quoteExpiresAt: quoteContext.quoteExpiresAt || null,
    instance: quoteContext.instance || instance || "",
  });
  await startClientDataFlow(quoteContext, number, clientName, quoteContext.instance || instance || "", pricingTable);
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
    pendingCatalogAreaConfirmByNumber,
    pendingHandoffAreasByNumber,
    pendingHandoffAreaConfirmByNumber,
    pendingHandoffPhotosByNumber,
    pendingPollByNumber,
    hasPendingPoll: (n, inst) => hasPendingPoll(n, inst),
  };
}

/**
 * Mensagem fora do dado esperado do passo → FAQ/IA só se precisar; senão reminder.
 */
async function sendUnexpectedInStep({
  db,
  number,
  text,
  instance,
  sendCapped,
  step,
  state,
  description,
  options = [],
  fallbackReminder,
  evolutionBase,
  apiKey,
  catalogPrompt,
}) {
  const unexpected = await resolveUnexpectedMessage({
    db,
    number,
    text,
    instance,
    memory: getFlowMemory(),
    flowContext: {
      state: state || step,
      step,
      description: description || "",
      options,
    },
    fallbackReminder:
      fallbackReminder || getFlowReminderMessage({ step }),
  });
  if (
    unexpected.kind === "propose_navigate" ||
    unexpected.kind === "cancel_navigate"
  ) {
    if (unexpected.message) {
      await sendCapped(number, unexpected.message);
    }
    return unexpected;
  }
  if (unexpected.kind === "navigate" && unexpected.targetStep) {
    await fulfillNavigation({
      targetStep: unexpected.targetStep,
      number,
      instance,
      db,
      sendCapped,
      evolutionBase,
      apiKey,
      catalogPrompt,
    });
    return unexpected;
  }
  if (unexpected.message) {
    await sendCapped(number, unexpected.message);
  }
  return unexpected;
}

/**
 * Aplica navegação confirmada e reabre o passo com prompt do fluxo real.
 */
async function fulfillNavigation({
  targetStep,
  number,
  instance,
  db,
  sendCapped,
  evolutionBase,
  apiKey,
  catalogPrompt,
}) {
  const result = await applyFlowNavigation({
    targetStep,
    number,
    instance,
    maps: getInteractionMaps(),
    db,
    catalogPrompt:
      catalogPrompt ||
      "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) 📍",
  });
  if (result.needsCatalog && evolutionBase && apiKey) {
    await sendCatalogFlow(
      evolutionBase,
      instance,
      apiKey,
      number,
      result.message,
    );
    return result;
  }
  if (result.message) {
    await sendCapped(number, result.message);
  }
  return result;
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
    const scopeKey = makeScopeKey(instance, number);
    pendingPollByNumber.delete(scopeKey);
    pendingPostQuoteChoiceByNumber.delete(scopeKey);
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
 * @param {string} baseUrl
 * @param {string} instance
 * @param {string} apiKey
 * @param {string} number
 * @param {string} clientName
 * @param {number[]} selectedAreas
 * @param {object[]} pricingTable
 * @param {(n: string, text: string) => Promise<unknown>} sendCapped
 */
async function issueCatalogQuoteFromAreas({
  number,
  clientName,
  selectedAreas,
  pricingTable,
  instance,
  sendCapped,
}) {
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

  await sendCapped(
    number,
    `Fechado, ${clientName}! 🔥\nCom base nas áreas que você marcou, montei seu orçamento personalizado:\n\n${breakdown}\n\n💰 Total estimado: ${formatBRL(total)}\n🗓️ Validade deste orçamento: até ${validityDate} (${QUOTE_VALIDITY_DAYS} dias)\n\nEsse é um valor base para o estilo Tattoo Nova. No atendimento final, a gente ajusta tamanho, detalhes e encaixe da arte pra fechar certinho no seu projeto.`,
  );
  await sendCapped(
    number,
    "Me diz como quer seguir:\n1 - Agendar 📅\n2 - Tirar dúvida 💬\n\n🚀 Para travar sua data, responda: AGENDAR",
  );

  pendingCatalogAreasByNumber.delete(makeScopeKey(instance, number));
  pendingCatalogAreaConfirmByNumber.delete(makeScopeKey(instance, number));
  const quoteIssuedAtMs = Date.now();
  const postQuoteData = {
    createdAt: quoteIssuedAtMs,
    quoteIssuedAtMs,
    quoteExpiresAtMs: quoteIssuedAtMs + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    selectedAreas,
    estimatedTotal: total,
  };
  await persistPostQuote(number, postQuoteData, getInteractionMaps(), instance);
  await clearInteraction(number, "catalog_areas", instance);
  await clearInteraction(number, "catalog_areas_confirm", instance);
  resetConfusion(number, instance);
}

/**
 * @param {object} params
 */
async function continueHandoffFromAreas({
  number,
  clientName,
  projectType,
  selectedAreas,
  pricingTable,
  instance,
  sendCapped,
}) {
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

  await sendCapped(
    number,
    `Perfeito, ${clientName}! ✅\nSe quiser, você pode me enviar fotos da tattoo atual para ajudar na avaliação do especialista 📸\nSe preferir seguir sem foto, é só responder normalmente que eu continuo.`,
  );

  const scopeKey = makeScopeKey(instance, number);
  pendingHandoffAreasByNumber.delete(scopeKey);
  pendingHandoffAreaConfirmByNumber.delete(scopeKey);
  const handoffPhotoData = {
    projectType,
    selectedAreas,
    total,
    breakdown,
    capturedAt: Date.now(),
  };
  await persistHandoffPhotos(number, handoffPhotoData, getInteractionMaps(), instance);
  await clearInteraction(number, "handoff_areas", instance);
  await clearInteraction(number, "handoff_areas_confirm", instance);
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
  const catalogPrompt =
    settings?.catalogPrompt?.trim() ||
    "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) 📍";
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
    memory: getFlowMemory(),
    onNavigate: async (targetStep) => {
      await fulfillNavigation({
        targetStep,
        number,
        instance,
        db,
        sendCapped: send,
        evolutionBase: baseUrl,
        apiKey,
        catalogPrompt,
      });
    },
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
  return withOutboundRateLimit(instance, async () => {
    try {
      const res = await evolutionFetchWithTimeout(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
        },
        body: JSON.stringify({ number, text }),
        timeoutMs: 8000,
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[webhook] sendText falhou", res.status, errBody);
      }
      if (res.ok) rememberBotOutboundText(number, text, instance);
      return res.ok;
    } catch (error) {
      console.error("[webhook] sendText erro", error?.message || error);
      return false;
    }
  });
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
    let res;
    try {
      res = await withOutboundRateLimit(instance, async () =>
        evolutionFetchWithTimeout(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify(payload),
          timeoutMs: 8000,
        }),
      );
    } catch (error) {
      console.warn("[webhook] sendMedia erro", {
        attempt,
        error: error?.message || error,
      });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      continue;
    }

    if (res.ok) {
      rememberBotOutboundMedia(number, instance);
      markCatalogSent(number, instance);
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
 * @param {string} [instance]
 */
async function muteBotForLead(number, reason, instance = "") {
  await updateDb((draft) => {
    muteNumberInDraft(draft, number, reason, instance);
    return draft;
  });
  console.log("[webhook] lead_muted_for_bot", { number, reason, instance, muteDays: 7 });
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
 * @param {string} [instance]
 * @returns {boolean}
 */
function recentlySentCatalog(number, instance = "") {
  const now = Date.now();
  const previous = recentCatalogByNumber.get(makeScopeKey(instance, number));
  return typeof previous === "number" && now - previous < 60_000;
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
function markCatalogSent(number, instance = "") {
  recentCatalogByNumber.set(makeScopeKey(instance, number), Date.now());
}

/**
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
function hasPendingPoll(number, instance = "") {
  const scopeKey = makeScopeKey(instance, number);
  const timestamp = pendingPollByNumber.get(scopeKey);
  if (typeof timestamp !== "number") return false;
  // Expira pendência para evitar disparos tardios de eventos não relacionados.
  if (Date.now() - timestamp > MENU_TTL_MS) {
    pendingPollByNumber.delete(scopeKey);
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
 * Retorna o número se houver exatamente um poll pendente nesta instância.
 * Ambíguo (0 ou >1) → string vazia (sem fallback cross-instance).
 * @param {string} instance
 * @returns {string}
 */
function getSinglePendingPollNumber(instance = "") {
  const prefix = `${String(instance || "").trim()}:`;
  if (!prefix || prefix === ":") return "";
  const now = Date.now();
  const valid = [];
  for (const [scopeKey, timestamp] of pendingPollByNumber.entries()) {
    if (!String(scopeKey).startsWith(prefix)) continue;
    if (typeof timestamp !== "number") continue;
    if (now - timestamp > MENU_TTL_MS) {
      pendingPollByNumber.delete(scopeKey);
      continue;
    }
    valid.push(scopeKey);
  }
  if (valid.length !== 1) return "";
  return parseScopeKey(valid[0]).number;
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
  if (
    !["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "CALL"].includes(
      normalized,
    )
  ) {
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
  const managedNumbers = db?.settings?.managedNumbers;
  if (
    Array.isArray(managedNumbers) &&
    managedNumbers.length > 0 &&
    !isManagedInstance(instance, managedNumbers)
  ) {
    console.log("[webhook] unmanaged_instance_ignored", { instance });
    return new NextResponse("ok", { status: 200 });
  }

  hydrateInteractionMaps(db, getInteractionMaps());
  const settings = db?.settings || {};
  const welcomeMessage =
    db?.settings?.welcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE;
  const projectPrompt =
    db?.settings?.projectPrompt?.trim() || DEFAULT_PROJECT_PROMPT;
  const catalogPrompt =
    db?.settings?.catalogPrompt?.trim() || DEFAULT_CATALOG_PROMPT;
  const pricingTable = Array.isArray(db?.pricing) ? db.pricing : [];
  const mutedLeadNumbers = await resolveHandoffMutes(db, updateDb);

  if (normalized === "CONNECTION_UPDATE") {
    const state = extractConnectionState(body);
    const digits = extractInstanceDigits(instance);
    const isClose = /close|disconnect|refused|logout|timeout/.test(state);
    const isOpen = /open|connected|online/.test(state);

    await updateDb((draft) => {
      if (!draft.settings) draft.settings = {};
      const list = Array.isArray(draft.settings.managedNumbers)
        ? draft.settings.managedNumbers
        : [];
      draft.settings.managedNumbers = list.map((item) => {
        const entry =
          typeof item === "string"
            ? { number: digitsOnly(item), name: "" }
            : item && typeof item === "object"
              ? { ...item }
              : null;
        if (!entry) return item;
        if (digitsOnly(entry.number) !== digits) return item;
        entry.connectionStatus = state || entry.connectionStatus || "";
        if (isClose) {
          entry.needsQr = true;
          entry.lastDisconnectAt = new Date().toISOString();
        }
        if (isOpen) {
          entry.needsQr = false;
        }
        return entry;
      });
      return draft;
    });

    if (isClose) {
      console.log("[webhook] connection_close_soft_reconnect", { instance, state });
      await softReconnectInstance(evolutionBase, instance, apiKey);
    }
    if (isOpen) {
      await sendPresence(evolutionBase, instance, apiKey, digits, "available");
      console.log("[webhook] connection_open", { instance, state });
    }
    return new NextResponse("ok", { status: 200 });
  }

  if (normalized === "CALL") {
    await rejectCall(evolutionBase, instance, apiKey, body?.data || body);
    console.log("[webhook] call_rejected", { instance });
    return new NextResponse("ok", { status: 200 });
  }

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
        !mappedNumber && !updateNumber ? getSinglePendingPollNumber(instance) : "";
      const number = mappedNumber || updateNumber || fallbackPendingNumber;
      if (!number) continue;
      const scopeKey = makeScopeKey(instance, number);
      const matchedPendingPoll =
        hasPendingPoll(number, instance) && updateLooksLikePollInteraction(updateObj);
      console.log("[webhook] messages_update", {
        number,
        instance,
        pollId,
        matchedNewTattoo,
        matchedPendingPoll,
      });
      if (!matchedNewTattoo && !matchedPendingPoll) continue;
      if (recentlySentCatalog(number, instance)) continue;

      await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
      pendingPollByNumber.delete(scopeKey);
      if (directMapKey) pendingPollByMessageId.delete(directMapKey);
    }
    return new NextResponse("ok", { status: 200 });
  }

  const entries = flattenWebhookMessageEntries(body.data);
  const { toProcess, ignored } = await filterInboundEntries(
    instance,
    entries,
    async (entry) => {
      const key =
        entry.key && typeof entry.key === "object"
          ? /** @type {Record<string, unknown>} */ (entry.key)
          : null;
      if (!key) return "";
      return resolveInboundNumber(key, /** @type {Record<string, unknown>} */ (entry), {
        baseUrl: evolutionBase,
        instance,
        apiKey,
      });
    },
  );

  if (ignored.length) {
    console.log("[webhook] inbound_filtered", {
      instance,
      ignored: ignored.map((item) => item.reason),
      count: ignored.length,
    });
  }

  for (const entry of toProcess) {
    const key =
      entry.key && typeof entry.key === "object"
        ? /** @type {Record<string, unknown>} */ (entry.key)
        : null;
    if (!key) continue;

    const number = await resolveInboundNumber(
      key,
      /** @type {Record<string, unknown>} */ (entry),
      { baseUrl: evolutionBase, instance, apiKey },
    );
    if (!number) continue;

    const scopeKey = makeScopeKey(instance, number);
    if (mutedLeadNumbers.has(scopeKey)) {
      console.log("[webhook] muted_number_ignored", { number, instance, scopeKey });
      continue;
    }

    if (!tryAcquireChatLock(scopeKey)) {
      console.log("[webhook] chat_lock_busy", { scopeKey });
      continue;
    }

    try {
      const messageId = extractMessageId(entry);
      if (messageId) markMessageSeen(instance, messageId);
      await markMessageAsRead(evolutionBase, instance, apiKey, key);
      await sendPresence(evolutionBase, instance, apiKey, number, "composing");

      const outboundCap = createOutboundCap();
      const sendCapped = async (n, msg) => {
        if (!outboundCap.canSend()) {
          console.log("[webhook] outbound_cap_reached", { number: n, scopeKey });
          return false;
        }
        const ok = await sendText(evolutionBase, instance, apiKey, n, msg);
        if (ok) outboundCap.record();
        return ok;
      };

      const clientName = extractClientName(
        /** @type {Record<string, unknown>} */ (entry),
        key,
      );

      const message =
        entry.message && typeof entry.message === "object" ? entry.message : null;
      const interactiveSelectionRaw = extractInteractiveSelection(
        message ? /** @type {Record<string, unknown>} */ (message) : null,
      );
      const interactiveSelectionFallback = extractAnySelectedValue(
        message ? /** @type {Record<string, unknown>} */ (message) : null,
      );
      const interactiveSelection = (
        interactiveSelectionRaw || interactiveSelectionFallback
      ).toLowerCase();
      const text = extractMessageText(message).trim();
      const normalizedText = text.toLowerCase();
      const hasPhotoInMessage = hasImageAttachment(
        message ? /** @type {Record<string, unknown>} */ (message) : null,
      );

      if (key.fromMe === true) {
        if (hasActiveFlow(number, db, instance)) {
          const likelyBot = isLikelyBotMessage(number, text, hasPhotoInMessage, instance);
          if (!likelyBot) {
            await muteBotForLead(number, "human_takeover_mid_flow", instance);
            await clearFlowState(number, instance);
            console.log("[webhook] human_takeover_detected", { number, instance });
          }
        }
        continue;
      }

      console.log("[webhook] upsert_inbound", {
        number,
        instance,
        scopeKey,
        hasText: Boolean(text),
        textPreview: text.slice(0, 60),
        interactiveSelectionRaw,
        interactiveSelectionFallback,
        hasPendingSelector: hasPendingPoll(number, instance),
        hasPixMedia: hasPhotoInMessage,
        inPixFlow: isInPixFlow(db, number, instance),
      });

      if (
        hasAudioAttachment(message ? /** @type {Record<string, unknown>} */ (message) : null) &&
        !isInPixFlow(db, number, instance)
      ) {
        await sendCapped(
          number,
          "No momento ainda não consigo ouvir áudios 🎙️\nPor favor, envie sua mensagem por texto.",
        );
        continue;
      }

      if (isAwaitingHumanChoice(number, instance) && normalizedText) {
        const humanChoice = await parseHumanHandoffChoice(normalizedText);

        if (humanChoice === "yes") {
          await executeHumanHandoff({
            number,
            clientName,
            db,
            settings,
            memory: getFlowMemory(),
            lastMessage: text,
            instance,
            sendText: sendCapped,
            clearFlows: () => clearFlowState(number, instance),
          });
          continue;
        }

        if (humanChoice === "no") {
          resetConfusion(number, instance);
          const ctx = detectFlowContext(db, number, getFlowMemory(), instance);
          await sendCapped(
            number,
            `Sem problemas! Vamos continuar. 👇\n\n${getFlowReminderMessage(ctx)}`,
          );
          continue;
        }

        await sendCapped(number, HUMAN_OFFER_BLOCK);
        continue;
      }

      // Confirmação pendente de navegação (Sim/Não) — antes dos fluxos
      if (getPendingNavConfirm(number, instance) && normalizedText) {
        const navReply = resolveNavConfirmReply(normalizedText, number, instance);
        if (navReply.action === "navigate" && navReply.targetStep) {
          const freshDb = await readDb();
          await fulfillNavigation({
            targetStep: navReply.targetStep,
            number,
            instance,
            db: freshDb,
            sendCapped,
            evolutionBase,
            apiKey,
            catalogPrompt:
              settings?.catalogPrompt?.trim() ||
              "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) 📍",
          });
          continue;
        }
        if (navReply.action === "cancel_navigate") {
          const ctx = detectFlowContext(db, number, getFlowMemory(), instance);
          await sendCapped(
            number,
            `${navReply.message}\n\n${getFlowReminderMessage(ctx)}`,
          );
          continue;
        }
        if (navReply.message) {
          await sendCapped(number, navReply.message);
          continue;
        }
      }

      if (hasSchedulingFlow(db, number, instance) || isInPixFlow(db, number, instance)) {
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

      const latestOutcomeForNumber = (
        Array.isArray(db?.leadOutcomes) ? db.leadOutcomes : []
      ).find((item) => {
        if (item?.number !== number) return false;
        const rowInst = String(item?.instance || "").trim();
        if (!rowInst || !instance) return true;
        return rowInst === instance;
      });
      const hasExpiredNonScheduledOutcome =
        (latestOutcomeForNumber?.outcome === "question_no_schedule" ||
          latestOutcomeForNumber?.outcome === "left_for_later") &&
        typeof latestOutcomeForNumber?.quoteExpiresAt === "string" &&
        Date.now() >= new Date(latestOutcomeForNumber.quoteExpiresAt).getTime();

      if (!hasActiveFlow(number, db, instance) && hasExpiredNonScheduledOutcome) {
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
          await beginAgendarFlow(
            evolutionBase,
            instance,
            apiKey,
            number,
            clientName,
            {
              selectedAreas,
              estimatedTotal,
              quoteIssuedAt: latestOutcomeForNumber?.quoteIssuedAt || null,
              quoteExpiresAt: latestOutcomeForNumber?.quoteExpiresAt || null,
              instance,
            },
            pricingTable,
          );
          continue;
        }
      }

      if (
        !hasActiveFlow(number, db, instance) &&
        hasExpiredNonScheduledOutcome &&
        !latestOutcomeForNumber?.expiryNoticeSentAt
      ) {
        await sendCapped(
          number,
          "Seu orçamento expirou hoje 🗓️\nSe você ainda quiser esse projeto, responda AGENDAR para reservar sua data.",
        );
        await updateDb((draft) => {
          const found = (draft.leadOutcomes || []).find(
            (item) =>
              item?.number === number &&
              item?.createdAt === latestOutcomeForNumber?.createdAt &&
              (!item?.instance || !instance || item.instance === instance),
          );
          if (found) {
            found.expiryNoticeSentAt = new Date().toISOString();
          }
          return draft;
        });
        continue;
      }

      if (
        pendingPostQuoteChoiceByNumber.has(scopeKey) &&
        (normalizedText || interactiveSelection)
      ) {
        const quoteContext = pendingPostQuoteChoiceByNumber.get(scopeKey) || {};
        const selectedAreas = Array.isArray(quoteContext.selectedAreas)
          ? quoteContext.selectedAreas
          : [];
        const estimatedTotal =
          typeof quoteContext.estimatedTotal === "number" ? quoteContext.estimatedTotal : 0;
        const quoteIssuedAtMs =
          typeof quoteContext.quoteIssuedAtMs === "number"
            ? quoteContext.quoteIssuedAtMs
            : Date.now();
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

        if (
          postQuoteChoice !== null &&
          (await applyPostQuoteChoice(postQuoteChoice, postQuoteParams))
        ) {
          resetConfusion(number, instance);
          continue;
        }

        const unexpectedPost = await resolveUnexpectedMessage({
          db,
          number,
          text: normalizedText || interactiveSelection,
          instance,
          memory: getFlowMemory(),
          flowContext: {
            state: "pos_orcamento",
            step: "post_quote_choice",
            description: "Cliente escolhe agendar ou tirar dúvida após orçamento.",
            options: [
              { id: 1, label: "Agendar" },
              { id: 2, label: "Tirar dúvida" },
            ],
          },
          fallbackReminder: getFlowReminderMessage({ step: "post_quote_choice" }),
        });
        if (
          unexpectedPost.kind === "select_option" &&
          (await applyPostQuoteChoice(unexpectedPost.optionId, postQuoteParams))
        ) {
          resetConfusion(number, instance);
          continue;
        }
        if (unexpectedPost.kind === "guide" && unexpectedPost.wantSchedule) {
          if (await applyPostQuoteChoice(1, postQuoteParams)) {
            continue;
          }
        }
        if (unexpectedPost.message) {
          await sendCapped(number, unexpectedPost.message);
        }
        continue;
      }

      if (pendingHandoffAreaConfirmByNumber.has(scopeKey) && normalizedText) {
        const confirmData = pendingHandoffAreaConfirmByNumber.get(scopeKey) || {};
        const projectType =
          confirmData?.projectType === "reformar" ? "reformar" : "complementar";

        if (isAreaConfirmationAffirmative(normalizedText)) {
          const suggestedAreas = Array.isArray(confirmData.suggestedAreas)
            ? confirmData.suggestedAreas.map(Number)
            : [];
          if (!suggestedAreas.length) {
            await sendCapped(
              number,
              processConfusionReply(
                number,
                "Não consegui confirmar as áreas. Me envie os números separados por vírgula (ex: 1,3,4).",
                instance,
              ),
            );
            continue;
          }
          await continueHandoffFromAreas({
            number,
            clientName,
            projectType,
            selectedAreas: suggestedAreas,
            pricingTable,
            instance,
            sendCapped,
          });
          continue;
        }

        const resolved = resolveAreaSelection(normalizedText, pricingTable);
        if (resolved.status === "empty") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "handoff_areas_confirm",
            state: "handoff_areas_confirm",
            description: "Confirmação de áreas no handoff.",
            options: [{ id: 1, label: "Sim, confirmar" }],
            fallbackReminder:
              buildAreaConfirmMessage(confirmData.suggestedAreas || []) ||
              "Diga *sim* para confirmar ou envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        if (resolved.status === "confirm") {
          await persistHandoffAreasConfirm(
            number,
            { projectType, suggestedAreas: resolved.suggestedAreas },
            getInteractionMaps(),
            instance,
          );
          await sendCapped(number, buildAreaConfirmMessage(resolved.suggestedAreas));
          continue;
        }
        if (resolved.status === "retry") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "handoff_areas_confirm",
            state: "handoff_areas_confirm",
            description: "Áreas inválidas na confirmação de handoff.",
            fallbackReminder:
              "Não encontrei essas áreas no catálogo. Envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        await continueHandoffFromAreas({
          number,
          clientName,
          projectType,
          selectedAreas: resolved.areas,
          pricingTable,
          instance,
          sendCapped,
        });
        continue;
      }

      if (pendingHandoffAreasByNumber.has(scopeKey) && normalizedText) {
        const handoffContext = pendingHandoffAreasByNumber.get(scopeKey);
        const projectType =
          handoffContext?.projectType === "reformar" ? "reformar" : "complementar";
        const resolved = resolveAreaSelection(normalizedText, pricingTable);
        if (resolved.status === "empty") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "handoff_areas",
            state: "handoff_areas",
            description: "Cliente deve enviar números das áreas para reforma/complemento.",
            fallbackReminder:
              "Não consegui identificar os números das áreas. Me envie apenas os números (ex: 2, 6 e 9).",
          });
          continue;
        }
        if (resolved.status === "confirm") {
          await persistHandoffAreasConfirm(
            number,
            { projectType, suggestedAreas: resolved.suggestedAreas },
            getInteractionMaps(),
            instance,
          );
          await sendCapped(number, buildAreaConfirmMessage(resolved.suggestedAreas));
          continue;
        }
        if (resolved.status === "retry") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "handoff_areas",
            state: "handoff_areas",
            description: "Números de área inválidos no handoff.",
            fallbackReminder:
              "Não encontrei essas áreas no catálogo. Envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        await continueHandoffFromAreas({
          number,
          clientName,
          projectType,
          selectedAreas: resolved.areas,
          pricingTable,
          instance,
          sendCapped,
        });
        continue;
      }

      if (pendingHandoffPhotosByNumber.has(scopeKey)) {
        const photoContext = pendingHandoffPhotosByNumber.get(scopeKey) || {};
        const projectType =
          photoContext?.projectType === "reformar" ? "reformar" : "complementar";
        const selectedAreas = Array.isArray(photoContext?.selectedAreas)
          ? photoContext.selectedAreas
          : [];
        const total = typeof photoContext?.total === "number" ? photoContext.total : 0;
        const breakdown =
          typeof photoContext?.breakdown === "string" ? photoContext.breakdown : "";
        const informedNoPhoto =
          /^(sem foto|sem fotos|nao tenho foto|não tenho foto)$/.test(normalizedText);
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
          await sendToSecretaries(sendCapped, settings, leadSummary);
        }
        await muteBotForLead(number, "handoff_started", instance);

        await sendCapped(
          number,
          secretaryNumbers.length
            ? `Perfeito, ${clientName}! ✅\nRecebi tudo e já encaminhei seu atendimento para o especialista responsável.\nEle vai assumir essa conversa com você em breve.`
            : `Perfeito, ${clientName}! ✅\nRecebi tudo e já deixei seu lead pronto para o especialista assumir a conversa.`,
        );

        pendingHandoffPhotosByNumber.delete(scopeKey);
        pendingPollByNumber.delete(scopeKey);
        pendingCatalogAreasByNumber.delete(scopeKey);
        pendingCatalogAreaConfirmByNumber.delete(scopeKey);
        pendingHandoffAreaConfirmByNumber.delete(scopeKey);
        pendingPostQuoteChoiceByNumber.delete(scopeKey);
        continue;
      }

      if (pendingCatalogAreaConfirmByNumber.has(scopeKey) && normalizedText) {
        const confirmData = pendingCatalogAreaConfirmByNumber.get(scopeKey) || {};

        if (isAreaConfirmationAffirmative(normalizedText)) {
          const suggestedAreas = Array.isArray(confirmData.suggestedAreas)
            ? confirmData.suggestedAreas.map(Number)
            : [];
          if (!suggestedAreas.length) {
            await sendCapped(
              number,
              processConfusionReply(
                number,
                "Não consegui confirmar as áreas. Me envie os números separados por vírgula (ex: 1,3,4).",
                instance,
              ),
            );
            continue;
          }
          await issueCatalogQuoteFromAreas({
            number,
            clientName,
            selectedAreas: suggestedAreas,
            pricingTable,
            instance,
            sendCapped,
          });
          continue;
        }

        const resolved = resolveAreaSelection(normalizedText, pricingTable);
        if (resolved.status === "empty") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "catalog_areas_confirm",
            state: "catalog_areas_confirm",
            description: "Confirmação de áreas do catálogo.",
            options: [{ id: 1, label: "Sim, confirmar" }],
            fallbackReminder:
              buildAreaConfirmMessage(confirmData.suggestedAreas || []) ||
              "Diga *sim* para confirmar ou envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        if (resolved.status === "confirm") {
          await persistCatalogAreasConfirm(
            number,
            resolved.suggestedAreas,
            getInteractionMaps(),
            instance,
          );
          await sendCapped(number, buildAreaConfirmMessage(resolved.suggestedAreas));
          continue;
        }
        if (resolved.status === "retry") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "catalog_areas_confirm",
            state: "catalog_areas_confirm",
            description: "Áreas inválidas na confirmação do catálogo.",
            fallbackReminder:
              "Não encontrei essas áreas no catálogo. Envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        await issueCatalogQuoteFromAreas({
          number,
          clientName,
          selectedAreas: resolved.areas,
          pricingTable,
          instance,
          sendCapped,
        });
        continue;
      }

      if (pendingCatalogAreasByNumber.has(scopeKey) && normalizedText) {
        const resolved = resolveAreaSelection(normalizedText, pricingTable);
        if (resolved.status === "empty") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "catalog_areas",
            state: "catalog_areas",
            description: "Cliente deve enviar números das áreas do catálogo.",
            fallbackReminder:
              "Não consegui identificar os números das áreas. Me envie apenas os números (ex: 1, 4 e 7).",
          });
          continue;
        }
        if (resolved.status === "confirm") {
          await persistCatalogAreasConfirm(
            number,
            resolved.suggestedAreas,
            getInteractionMaps(),
            instance,
          );
          await sendCapped(number, buildAreaConfirmMessage(resolved.suggestedAreas));
          continue;
        }
        if (resolved.status === "retry") {
          await sendUnexpectedInStep({
            db,
            number,
            text: normalizedText,
            instance,
            sendCapped,
            step: "catalog_areas",
            state: "catalog_areas",
            description: "Números de área inválidos no catálogo.",
            fallbackReminder:
              "Não encontrei essas áreas no catálogo. Envie os números separados por vírgula (ex: 1,3,4).",
          });
          continue;
        }
        await issueCatalogQuoteFromAreas({
          number,
          clientName,
          selectedAreas: resolved.areas,
          pricingTable,
          instance,
          sendCapped,
        });
        continue;
      }

      if (hasPendingPoll(number, instance) && (normalizedText || interactiveSelection)) {
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

        if (
          menuChoice === 1 ||
          normalizedText.includes("nova tattoo") ||
          normalizedText === "novo" ||
          normalizedText === "nova"
        ) {
          resetConfusion(number, instance);
          await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
          pendingPollByNumber.delete(scopeKey);
          await clearInteraction(number, "main_menu", instance);
          await persistCatalogAreas(number, getInteractionMaps(), instance);
          continue;
        }
        if (menuChoice === 2) {
          await sendCatalog(evolutionBase, instance, apiKey, number);
          await sendCapped(
            number,
            "Perfeito! Para reforma, me envie os números das áreas da imagem (ex: 2, 6 e 9) para eu encaminhar seu lead completo ao especialista. ♻️",
          );
          await persistHandoffAreas(
            number,
            { projectType: "reformar", createdAt: Date.now() },
            getInteractionMaps(),
            instance,
          );
          pendingPollByNumber.delete(scopeKey);
          await clearInteraction(number, "main_menu", instance);
          pendingHandoffPhotosByNumber.delete(scopeKey);
          pendingPostQuoteChoiceByNumber.delete(scopeKey);
          await clearInteraction(number, "post_quote", instance);
          continue;
        }
        if (menuChoice === 3) {
          await sendCatalog(evolutionBase, instance, apiKey, number);
          await sendCapped(
            number,
            "Boa! Para complemento, me envie os números das áreas da imagem (ex: 3, 7 e 10) para eu encaminhar seu lead completo ao especialista. 🧩",
          );
          await persistHandoffAreas(
            number,
            { projectType: "complementar", createdAt: Date.now() },
            getInteractionMaps(),
            instance,
          );
          pendingPollByNumber.delete(scopeKey);
          await clearInteraction(number, "main_menu", instance);
          pendingHandoffPhotosByNumber.delete(scopeKey);
          pendingPostQuoteChoiceByNumber.delete(scopeKey);
          await clearInteraction(number, "post_quote", instance);
          continue;
        }

        const unexpectedMenu = await resolveUnexpectedMessage({
          db,
          number,
          text: normalizedText || interactiveSelection,
          instance,
          memory: getFlowMemory(),
          flowContext: {
            state: "menu_principal",
            step: "main_menu",
            description: "Menu inicial: tipo de projeto.",
            options: [
              { id: 1, label: "Nova Tattoo" },
              { id: 2, label: "Reformar" },
              { id: 3, label: "Complementar" },
            ],
          },
          fallbackReminder: getFlowReminderMessage({ step: "main_menu" }),
        });

        if (unexpectedMenu.kind === "select_option") {
          if (unexpectedMenu.optionId === 1) {
            resetConfusion(number, instance);
            await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
            pendingPollByNumber.delete(scopeKey);
            await clearInteraction(number, "main_menu", instance);
            await persistCatalogAreas(number, getInteractionMaps(), instance);
            continue;
          }
          if (unexpectedMenu.optionId === 2) {
            await sendCatalog(evolutionBase, instance, apiKey, number);
            await sendCapped(
              number,
              "Perfeito! Para reforma, me envie os números das áreas da imagem (ex: 2, 6 e 9) para eu encaminhar seu lead completo ao especialista. ♻️",
            );
            await persistHandoffAreas(
              number,
              { projectType: "reformar", createdAt: Date.now() },
              getInteractionMaps(),
              instance,
            );
            pendingPollByNumber.delete(scopeKey);
            await clearInteraction(number, "main_menu", instance);
            continue;
          }
          if (unexpectedMenu.optionId === 3) {
            await sendCatalog(evolutionBase, instance, apiKey, number);
            await sendCapped(
              number,
              "Boa! Para complemento, me envie os números das áreas da imagem (ex: 3, 7 e 10) para eu encaminhar seu lead completo ao especialista. 🧩",
            );
            await persistHandoffAreas(
              number,
              { projectType: "complementar", createdAt: Date.now() },
              getInteractionMaps(),
              instance,
            );
            pendingPollByNumber.delete(scopeKey);
            await clearInteraction(number, "main_menu", instance);
            continue;
          }
        }

        if (unexpectedMenu.message) {
          await sendCapped(number, unexpectedMenu.message);
        }
        continue;
      }

      if (
        interactiveSelection === OPTION_NEW_TATTOO ||
        normalizedText.includes("nova tattoo") ||
        normalizedText === "novo" ||
        normalizedText === "nova"
      ) {
        await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
        pendingPollByNumber.delete(scopeKey);
        await clearInteraction(number, "main_menu", instance);
        await persistCatalogAreas(number, getInteractionMaps(), instance);
        continue;
      }

      if (!text && !hasPhotoInMessage) continue;

      if (normalizedText.includes("nova tattoo") || normalizedText === "novo") {
        await sendCatalogFlow(evolutionBase, instance, apiKey, number, catalogPrompt);
        await persistCatalogAreas(number, getInteractionMaps(), instance);
        continue;
      }

      if (hasActiveFlow(number, db, instance)) {
        const flowResult = await handleUnknownInActiveFlow({
          db,
          number,
          userMessage: normalizedText || interactiveSelection,
          memory: getFlowMemory(),
          instance,
        });

        const quoteContext = pendingPostQuoteChoiceByNumber.get(scopeKey) || {};
        const buildPostQuoteParams = () => {
          const selectedAreas = Array.isArray(quoteContext.selectedAreas)
            ? quoteContext.selectedAreas
            : [];
          const estimatedTotal =
            typeof quoteContext.estimatedTotal === "number" ? quoteContext.estimatedTotal : 0;
          const quoteIssuedAtMs =
            typeof quoteContext.quoteIssuedAtMs === "number"
              ? quoteContext.quoteIssuedAtMs
              : Date.now();
          const quoteExpiresAtMs =
            typeof quoteContext.quoteExpiresAtMs === "number"
              ? quoteContext.quoteExpiresAtMs
              : quoteIssuedAtMs + QUOTE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
          return {
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
        };

        if (
          flowResult.optionId !== undefined &&
          flowResult.flowContext?.step === "post_quote_choice"
        ) {
          if (await applyPostQuoteChoice(flowResult.optionId, buildPostQuoteParams())) {
            continue;
          }
        }

        if (
          flowResult.optionId !== undefined &&
          flowResult.flowContext?.step === "faq" &&
          flowResult.optionId === 1
        ) {
          const scheduleFaq = getPendingSchedule(db, number, instance);
          if (scheduleFaq?.step === "faq") {
            resetConfusion(number, instance);
            await removePendingSchedule(number, instance);
            await beginAgendarFlow(
              evolutionBase,
              instance,
              apiKey,
              number,
              clientName,
              {
                selectedAreas: scheduleFaq.selectedAreas || [],
                estimatedTotal: scheduleFaq.estimatedTotal || 0,
                quoteIssuedAt: scheduleFaq.quoteIssuedAt || null,
                quoteExpiresAt: scheduleFaq.quoteExpiresAt || null,
                instance,
              },
              pricingTable,
            );
            continue;
          }
        }

        if (flowResult.coachAction === "guide" && flowResult.wantSchedule) {
          const step = flowResult.flowContext?.step;
          if (step === "post_quote_choice") {
            if (await applyPostQuoteChoice(1, buildPostQuoteParams())) {
              continue;
            }
          }
          if (step === "faq") {
            const scheduleFaq = getPendingSchedule(db, number, instance);
            if (scheduleFaq?.step === "faq") {
              resetConfusion(number, instance);
              await removePendingSchedule(number, instance);
              await beginAgendarFlow(
                evolutionBase,
                instance,
                apiKey,
                number,
                clientName,
                {
                  selectedAreas: scheduleFaq.selectedAreas || [],
                  estimatedTotal: scheduleFaq.estimatedTotal || 0,
                  quoteIssuedAt: scheduleFaq.quoteIssuedAt || null,
                  quoteExpiresAt: scheduleFaq.quoteExpiresAt || null,
                  instance,
                },
                pricingTable,
              );
              continue;
            }
          }
          if (flowResult.coachMessage) {
            await sendCapped(number, flowResult.coachMessage);
          }
          continue;
        }

        if (
          flowResult.mappedValue === "yes" &&
          (flowResult.flowContext?.step === "post_quote_choice" ||
            flowResult.flowContext?.step === "faq")
        ) {
          const step = flowResult.flowContext?.step;
          if (step === "post_quote_choice") {
            if (await applyPostQuoteChoice(1, buildPostQuoteParams())) {
              continue;
            }
          }
          if (step === "faq") {
            const scheduleFaq = getPendingSchedule(db, number, instance);
            if (scheduleFaq?.step === "faq") {
              resetConfusion(number, instance);
              await removePendingSchedule(number, instance);
              await beginAgendarFlow(
                evolutionBase,
                instance,
                apiKey,
                number,
                clientName,
                {
                  selectedAreas: scheduleFaq.selectedAreas || [],
                  estimatedTotal: scheduleFaq.estimatedTotal || 0,
                  quoteIssuedAt: scheduleFaq.quoteIssuedAt || null,
                  quoteExpiresAt: scheduleFaq.quoteExpiresAt || null,
                  instance,
                },
                pricingTable,
              );
              continue;
            }
          }
        }

        if (
          flowResult.mappedValue === "yes" &&
          pendingCatalogAreaConfirmByNumber.has(scopeKey)
        ) {
          const confirmData = pendingCatalogAreaConfirmByNumber.get(scopeKey) || {};
          const suggestedAreas = Array.isArray(confirmData.suggestedAreas)
            ? confirmData.suggestedAreas.map(Number)
            : [];
          if (suggestedAreas.length) {
            await issueCatalogQuoteFromAreas({
              number,
              clientName,
              selectedAreas: suggestedAreas,
              pricingTable,
              instance,
              sendCapped,
            });
            continue;
          }
        }

        if (
          flowResult.mappedValue === "yes" &&
          pendingHandoffAreaConfirmByNumber.has(scopeKey)
        ) {
          const confirmData = pendingHandoffAreaConfirmByNumber.get(scopeKey) || {};
          const projectType =
            confirmData?.projectType === "reformar" ? "reformar" : "complementar";
          const suggestedAreas = Array.isArray(confirmData.suggestedAreas)
            ? confirmData.suggestedAreas.map(Number)
            : [];
          if (suggestedAreas.length) {
            await continueHandoffFromAreas({
              number,
              clientName,
              projectType,
              selectedAreas: suggestedAreas,
              pricingTable,
              instance,
              sendCapped,
            });
            continue;
          }
        }

        if (
          flowResult.coachAction === "propose_navigate" ||
          flowResult.coachAction === "cancel_navigate"
        ) {
          if (flowResult.coachMessage) {
            await sendCapped(number, flowResult.coachMessage);
          }
          continue;
        }
        if (flowResult.coachAction === "navigate" && flowResult.targetStep) {
          await fulfillNavigation({
            targetStep: flowResult.targetStep,
            number,
            instance,
            db,
            sendCapped,
            evolutionBase,
            apiKey,
            catalogPrompt,
          });
          continue;
        }

        if (
          flowResult.coachAction === "answer" ||
          flowResult.coachAction === "offer_human" ||
          flowResult.coachAction === "guide"
        ) {
          if (flowResult.coachMessage) {
            await sendCapped(number, flowResult.coachMessage);
          }
          continue;
        }

        if (flowResult.reminder) {
          await sendCapped(number, flowResult.reminder);
        }
        continue;
      }

      if (!shouldSendWelcome(scopeKey)) {
        console.log("[webhook] welcome_debounced", { scopeKey });
        continue;
      }

      const sentWelcome = await sendCapped(number, welcomeMessage);
      if (!sentWelcome) continue;
      markWelcomeSent(scopeKey);

      await sendCapped(number, projectPrompt);
      const selectorResult = await sendProjectSelector(
        evolutionBase,
        instance,
        apiKey,
        number,
      );
      if (selectorResult.ok && selectorResult.messageId) {
        pendingPollByMessageId.set(`${instance}:${selectorResult.messageId}`, number);
      }
      if (selectorResult.ok) {
        await persistMainMenu(number, getInteractionMaps(), instance);
      } else {
        await sendCapped(number, SELECTOR_TEXT_FALLBACK);
      }
    } finally {
      releaseChatLock(scopeKey);
    }
  }

  return new NextResponse("ok", { status: 200 });
}
