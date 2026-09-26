import {
  interpretInFlowMessage,
  answerTattooFaq,
  isGeminiConfigured,
} from "@/lib/gemini";
import { matchLocalFaqAnswer } from "@/lib/faq-tattoo-tribal";
import { getFlowReminderMessage } from "@/lib/flow-context";
import { isAffirmative, isNegative } from "@/lib/conversation-intent";
import { offerHumanChoice, processConfusionReply, resetConfusion } from "@/lib/human-handoff";
import { getPendingSchedule } from "@/lib/flows/flow-store";
import {
  detectNavigationIntent,
  proposeNavigation,
  resolveNavConfirmReply,
  getPendingNavConfirm,
} from "@/lib/flow-navigation";

const MIN_CONFIDENCE = 0.6;

const FAQ_UNKNOWN_CLIENT_MSG =
  "Boa pergunta! Não tenho essa resposta com segurança agora. Quer que um atendente humano te ajude?";

/**
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeQuestion(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  if (t.includes("?")) return true;
  return /\b(duvida|dúvida|pergunta|quanto|como|posso|demora|dói|doi|sera|será|o que|oq|so faz|só faz|fazem|voces|vocês)\b/.test(
    t,
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function looksConfused(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /\b(nao entendi|nao entendo|como assim|o que e isso|explica|confuso|huh)\b/.test(t);
}

/**
 * @param {object} flowContext
 * @returns {string}
 */
function defaultGuideHint(flowContext) {
  return getFlowReminderMessage(flowContext);
}

/**
 * @param {object} params
 * @returns {Promise<{
 *   action: 'select_option'|'continue_value'|'answer'|'offer_human'|'guide'|'reminder'|'propose_navigate'|'navigate'|'cancel_navigate'|'none',
 *   optionId?: number,
 *   mappedValue?: string,
 *   message?: string,
 *   targetStep?: string,
 *   wantSchedule?: boolean,
 *   flowContext?: object,
 * }>}
 */
export async function handleAiCoachTurn(params) {
  const { db, number, text, flowContext, instance = "" } = params;
  const userMessage = String(text || "").trim();
  if (!userMessage || !flowContext) {
    return { action: "none" };
  }

  const faqEntries = db?.settings?.faqEntries;
  const schedule = getPendingSchedule(db, number, instance);
  const quoteContext = {
    selectedAreas: schedule?.selectedAreas || [],
    estimatedTotal: schedule?.estimatedTotal || 0,
  };

  // 0) Confirmação de navegação pendente tem prioridade
  if (getPendingNavConfirm(number, instance)) {
    const navReply = resolveNavConfirmReply(userMessage, number, instance);
    if (navReply.action === "navigate") {
      resetConfusion(number, instance);
      return {
        action: "navigate",
        targetStep: navReply.targetStep,
        flowContext,
      };
    }
    if (navReply.action === "cancel_navigate") {
      resetConfusion(number, instance);
      return {
        action: "cancel_navigate",
        message: `${navReply.message}\n\n${defaultGuideHint(flowContext)}`,
        flowContext,
      };
    }
    if (navReply.message) {
      return {
        action: "propose_navigate",
        targetStep: getPendingNavConfirm(number, instance)?.targetStep,
        message: navReply.message,
        flowContext,
      };
    }
  }

  // 1) Navegação local (voltar / errei / não é esse número) — antes de FAQ e yes/no
  const navIntent = detectNavigationIntent(userMessage, flowContext);
  if (navIntent && navIntent.confidence >= 0.7) {
    resetConfusion(number, instance);
    const proposed = proposeNavigation(number, navIntent.targetStep, instance);
    return {
      action: "propose_navigate",
      targetStep: proposed.targetStep,
      message: proposed.message,
      flowContext,
    };
  }

  // 2) FAQ local — só assume se houver match na base (não inventa)
  const localAnswer = matchLocalFaqAnswer(userMessage, faqEntries);
  if (localAnswer) {
    resetConfusion(number, instance);
    const hint = defaultGuideHint(flowContext);
    return {
      action: "answer",
      message: `${localAnswer}\n\n${hint}`,
      flowContext,
    };
  }

  // 3) Equivalentes locais yes/no quando o passo tem opções binárias
  const options = Array.isArray(flowContext.options) ? flowContext.options : [];
  const yesOpt = options.find((o) => /sim|agendar|atendente|confirmar/i.test(String(o.label || "")));
  const noOpt = options.find((o) => /n[aã]o|d[uú]vida|bot|continuar/i.test(String(o.label || "")));

  if (isAffirmative(userMessage) && yesOpt) {
    resetConfusion(number, instance);
    return { action: "select_option", optionId: yesOpt.id, flowContext };
  }
  if (isNegative(userMessage) && noOpt) {
    resetConfusion(number, instance);
    return { action: "select_option", optionId: noOpt.id, flowContext };
  }
  if (isAffirmative(userMessage) && !options.length) {
    return { action: "continue_value", mappedValue: "yes", flowContext };
  }
  if (isNegative(userMessage) && !options.length) {
    return { action: "continue_value", mappedValue: "no", flowContext };
  }

  // 4) Sem IA configurada: pergunta → humano; senão reminder do passo
  if (!isGeminiConfigured()) {
    if (looksLikeQuestion(userMessage) || looksConfused(userMessage)) {
      return {
        action: "offer_human",
        message: offerHumanChoice(number, FAQ_UNKNOWN_CLIENT_MSG, instance),
        flowContext,
      };
    }
    return {
      action: "reminder",
      message: processConfusionReply(number, defaultGuideHint(flowContext), instance),
      flowContext,
    };
  }

  // 5) OmniRoute — só quando local não resolveu
  const interpreted = await interpretInFlowMessage(flowContext, userMessage, {
    quoteContext,
    faqEntries,
  });

  if (!interpreted || interpreted.confidence < MIN_CONFIDENCE) {
    if (looksLikeQuestion(userMessage) || looksConfused(userMessage)) {
      const aiAnswer = await answerTattooFaq(userMessage, quoteContext, faqEntries);
      if (aiAnswer) {
        resetConfusion(number, instance);
        return {
          action: "answer",
          message: `${aiAnswer}\n\n${defaultGuideHint(flowContext)}`,
          flowContext,
        };
      }
      return {
        action: "offer_human",
        message: offerHumanChoice(number, FAQ_UNKNOWN_CLIENT_MSG, instance),
        flowContext,
      };
    }
    return {
      action: "reminder",
      message: processConfusionReply(number, defaultGuideHint(flowContext), instance),
      flowContext,
    };
  }

  const { intent } = interpreted;

  if (intent === "navigate" && interpreted.targetStep) {
    resetConfusion(number, instance);
    const proposed = proposeNavigation(number, interpreted.targetStep, instance);
    return {
      action: "propose_navigate",
      targetStep: proposed.targetStep,
      message: proposed.message,
      flowContext,
    };
  }

  if (intent === "equivalent_answer") {
    if (
      typeof interpreted.mappedOptionId === "number" &&
      options.some((o) => o.id === interpreted.mappedOptionId)
    ) {
      resetConfusion(number, instance);
      return {
        action: "select_option",
        optionId: interpreted.mappedOptionId,
        flowContext,
      };
    }
    if (interpreted.mappedValue === "yes" || interpreted.mappedValue === "no") {
      if (interpreted.mappedValue === "yes" && yesOpt) {
        resetConfusion(number, instance);
        return { action: "select_option", optionId: yesOpt.id, flowContext };
      }
      if (interpreted.mappedValue === "no" && noOpt) {
        resetConfusion(number, instance);
        return { action: "select_option", optionId: noOpt.id, flowContext };
      }
      resetConfusion(number, instance);
      return {
        action: "continue_value",
        mappedValue: interpreted.mappedValue,
        flowContext,
      };
    }
  }

  if (intent === "ask_question") {
    let answer = interpreted.knowsAnswer ? interpreted.answer : null;
    if (!answer) {
      answer = matchLocalFaqAnswer(userMessage, faqEntries);
    }
    if (!answer) {
      answer = await answerTattooFaq(userMessage, quoteContext, faqEntries);
    }
    if (answer) {
      resetConfusion(number, instance);
      const hint = interpreted.guideHint || defaultGuideHint(flowContext);
      return { action: "answer", message: `${answer}\n\n${hint}`, flowContext };
    }
    return {
      action: "offer_human",
      message: offerHumanChoice(number, FAQ_UNKNOWN_CLIENT_MSG, instance),
      flowContext,
    };
  }

  if (intent === "want_schedule") {
    resetConfusion(number, instance);
    return {
      action: "guide",
      message: interpreted.guideHint || defaultGuideHint(flowContext),
      wantSchedule: true,
      flowContext,
    };
  }

  if (intent === "confused" || intent === "out_of_scope") {
    return {
      action: "reminder",
      message: processConfusionReply(
        number,
        interpreted.guideHint || defaultGuideHint(flowContext),
        instance,
      ),
      flowContext,
    };
  }

  return {
    action: "reminder",
    message: processConfusionReply(number, defaultGuideHint(flowContext), instance),
    flowContext,
  };
}
