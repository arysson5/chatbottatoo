import { updateDb } from "@/lib/simple-db";
import { formatBRL } from "@/lib/currency";
import { getPendingSchedule, getPendingPayment } from "@/lib/flows/flow-store";
import { detectFlowContext } from "@/lib/flow-context";
import { sendToSecretaries, getSecretaryNumbers } from "@/lib/secretary-notify";
import { muteNumberInDraft } from "@/lib/handoff-mute";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { resolveOriginFromInstance } from "@/lib/managed-numbers";
import { makeScopeKey } from "@/lib/scope-key";

const CONFUSION_THRESHOLD = 3;
const MS_OFFER_TTL = 30 * 60_000;

/** @type {Map<string, { count: number, awaitingChoice: boolean, offeredAt?: number }>} */
const confusionByScope = new Map();

export const HUMAN_OFFER_BLOCK = `Percebi que estou com dificuldade em te entender 😅
Quer que um atendente humano assuma esta conversa?

1 - Sim, falar com atendente 👤
2 - Não, continuar com o bot 🤖`;

/**
 * @param {string} number
 * @param {string} [instance]
 */
export function resetConfusion(number, instance = "") {
  confusionByScope.delete(makeScopeKey(instance, number));
}

/**
 * @param {string} number
 * @param {string} [instance]
 * @returns {boolean}
 */
export function isAwaitingHumanChoice(number, instance = "") {
  const key = makeScopeKey(instance, number);
  const state = confusionByScope.get(key);
  if (!state?.awaitingChoice) return false;
  if (state.offeredAt && Date.now() - state.offeredAt > MS_OFFER_TTL) {
    confusionByScope.delete(key);
    return false;
  }
  return true;
}

/**
 * @param {string} number
 * @param {string} baseMessage
 * @param {string} [instance]
 * @returns {string}
 */
export function processConfusionReply(number, baseMessage, instance = "") {
  const key = makeScopeKey(instance, number);
  const state = confusionByScope.get(key) || { count: 0, awaitingChoice: false };

  if (state.awaitingChoice) {
    return baseMessage;
  }

  state.count += 1;

  if (state.count >= CONFUSION_THRESHOLD) {
    state.awaitingChoice = true;
    state.offeredAt = Date.now();
    confusionByScope.set(key, state);
    return `${baseMessage}\n\n${HUMAN_OFFER_BLOCK}`;
  }

  confusionByScope.set(key, state);
  return baseMessage;
}

/**
 * @param {string} text
 * @returns {Promise<"yes" | "no" | null>}
 */
export async function parseHumanHandoffChoice(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  if (/^(sim|s|quero|atendente|humano|falar com|1|1\.|yes)$/i.test(normalized)) {
    return "yes";
  }
  if (/^(nao|não|n|continuar|bot|2|2\.|no)$/i.test(normalized)) {
    return "no";
  }

  const choice = await resolveOptionChoice({
    state: "oferta_atendente_humano",
    options: [
      { id: 1, label: "Sim, falar com atendente" },
      { id: 2, label: "Não, continuar com o bot" },
    ],
    userMessage: normalized,
  });

  if (choice === 1) return "yes";
  if (choice === 2) return "no";
  return null;
}

/**
 * @param {object} params
 * @returns {string}
 */
export function buildHumanHandoffSummary(params) {
  const {
    number,
    clientName,
    db,
    memory,
    lastMessage = "",
    confusionCount = 0,
    instance = "",
    settings,
  } = params;

  const origin = resolveOriginFromInstance(instance, settings?.managedNumbers);
  const scopeKey = makeScopeKey(instance, number);

  const flowContext = detectFlowContext(db, number, memory || {}, instance);
  const schedule = getPendingSchedule(db, number, instance);
  const payment = getPendingPayment(db, number, instance);
  const postQuote = memory?.pendingPostQuoteChoiceByNumber?.get?.(scopeKey) || null;
  const handoffAreas = memory?.pendingHandoffAreasByNumber?.get?.(scopeKey) || null;

  const lines = [
    "🚨 ATENDIMENTO HUMANO SOLICITADO",
    "",
    `Cliente: ${clientName || "Não informado"}`,
    `WhatsApp: ${number}`,
    `Última mensagem: ${lastMessage || "(sem texto)"}`,
    `Tentativas sem entendimento: ${confusionCount || CONFUSION_THRESHOLD}+`,
    "",
    "── Contexto do fluxo ──",
    `Passo atual: ${flowContext?.description || "Menu inicial / fora de fluxo"}`,
  ];

  if (postQuote) {
    const areas = Array.isArray(postQuote.selectedAreas) ? postQuote.selectedAreas.join(", ") : "-";
    const total =
      typeof postQuote.estimatedTotal === "number" ? formatBRL(postQuote.estimatedTotal) : "-";
    lines.push(`Orçamento pendente: ${total} | Áreas: ${areas}`);
  }

  if (schedule) {
    if (schedule.clientName || schedule.fullName) {
      lines.push(`Nome coletado: ${schedule.fullName || schedule.clientName}`);
    }
    if (schedule.clientPhone) lines.push(`Telefone coletado: ${schedule.clientPhone}`);
    if (schedule.tattooLocation) lines.push(`Local tattoo: ${schedule.tattooLocation}`);
    if (schedule.slotLabel) lines.push(`Horário escolhido: ${schedule.slotLabel}`);
    if (schedule.selectedAreas?.length) {
      lines.push(`Áreas: ${schedule.selectedAreas.join(", ")}`);
    }
    if (schedule.estimatedTotal) {
      lines.push(`Orçamento: ${formatBRL(schedule.estimatedTotal)}`);
    }
    lines.push(`Etapa agendamento: ${schedule.step || "-"}`);
  }

  if (payment) {
    lines.push(
      `PIX: aguardando sinal de ${formatBRL(payment.amountRequired || 0)} | pago ${formatBRL(payment.amountPaid || 0)}`,
    );
    if (payment.manualAmountUsed) {
      lines.push("PIX informado manualmente pelo cliente — conferir pagamento.");
    }
    if (payment.pixTransactionId) {
      lines.push(`ID transação PIX: ${payment.pixTransactionId}`);
    }
    if (payment.verifiedByReceipt) {
      lines.push("Comprovante validado automaticamente.");
    }
  }

  if (handoffAreas?.projectType) {
    lines.push(`Tipo projeto handoff: ${handoffAreas.projectType}`);
  }

  const latestOutcome = (Array.isArray(db?.leadOutcomes) ? db.leadOutcomes : []).find(
    (item) => item?.number === number,
  );
  if (latestOutcome?.outcome) {
    lines.push(`Último outcome: ${latestOutcome.outcome}`);
  }

  const originLine = origin.name
    ? `Linha de atendimento: ${origin.name} (${origin.number})`
    : origin.number
      ? `Linha de atendimento: ${origin.number}`
      : "Origem: Bot Briza Tattoo";
  lines.push("", "Ação: entrar em contato com o cliente e assumir a conversa no WhatsApp.", originLine);

  return lines.join("\n");
}

/**
 * @param {object} params
 */
export async function executeHumanHandoff(params) {
  const {
    number,
    clientName,
    db,
    settings,
    memory,
    lastMessage,
    instance = "",
    sendText,
    clearFlows,
  } = params;

  const confusionCount =
    confusionByScope.get(makeScopeKey(instance, number))?.count || CONFUSION_THRESHOLD;
  const origin = resolveOriginFromInstance(instance, settings?.managedNumbers);
  const summary = buildHumanHandoffSummary({
    number,
    clientName,
    db,
    settings,
    memory,
    lastMessage,
    confusionCount,
    instance,
  });

  const secretaryNumbers = getSecretaryNumbers(settings);
  const schedule = getPendingSchedule(db, number, instance);

  await updateDb((draft) => {
    draft.leads.unshift({
      number,
      projectType: "atendimento_humano",
      handoffNumber: secretaryNumbers[0] || "",
      selectedAreas: schedule?.selectedAreas || [],
      estimatedTotal: schedule?.estimatedTotal || 0,
      hasPhotos: false,
      originNumber: origin.number,
      originNumberName: origin.name,
      contextSummary: summary,
      createdAt: new Date().toISOString(),
      status: "pending_handoff",
    });
    draft.leads = draft.leads.slice(0, 200);
    muteNumberInDraft(draft, number, "human_assistance_requested", instance);
    return draft;
  });

  if (secretaryNumbers.length) {
    await sendToSecretaries(sendText, settings, summary);
  }

  if (typeof clearFlows === "function") {
    clearFlows();
  }

  resetConfusion(number, instance);

  await sendText(
    number,
    secretaryNumbers.length
      ? `Pronto, ${clientName || "tudo bem"}! ✅\nEncaminhei seu atendimento para nossa equipe com todo o contexto.\nUm atendente vai assumir esta conversa em breve. 🤝`
      : `Anotei seu pedido de atendimento! ✅\nNossa equipe foi avisada e entrará em contato em breve.`,
  );

  console.log("[human-handoff] executed", { number, secretaries: secretaryNumbers.length });
}
