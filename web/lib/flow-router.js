import { detectFlowContext, getFlowReminderMessage } from "@/lib/flow-context";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { parseFlowIntent, isGeminiConfigured } from "@/lib/gemini";
import { processConfusionReply } from "@/lib/human-handoff";
import { handleAiCoachTurn, looksLikeQuestion, looksConfused } from "@/lib/ai-flow-coach";

/**
 * Quando o passo não reconheceu o dado esperado: tenta IA/FAQ só se precisar.
 * @param {object} params
 * @returns {Promise<{
 *   kind: 'select_option'|'continue_value'|'answer'|'offer_human'|'guide'|'reminder'|'propose_navigate'|'navigate'|'cancel_navigate',
 *   optionId?: number,
 *   mappedValue?: string,
 *   message?: string,
 *   targetStep?: string,
 *   wantSchedule?: boolean,
 *   flowContext?: object,
 * }>}
 */
export async function resolveUnexpectedMessage(params) {
  const {
    db,
    number,
    text,
    instance = "",
    memory,
    flowContext: givenContext,
    fallbackReminder,
  } = params;

  const flowContext =
    givenContext || detectFlowContext(db, number, memory || {}, instance);
  const reminderBase = fallbackReminder || getFlowReminderMessage(flowContext);

  if (!String(text || "").trim()) {
    return {
      kind: "reminder",
      message: processConfusionReply(number, reminderBase, instance),
      flowContext,
    };
  }

  const coach = await handleAiCoachTurn({
    db,
    number,
    text,
    flowContext: flowContext || {
      state: "unknown",
      step: "unknown",
      description: "Mensagem fora do script do passo atual.",
      options: [],
    },
    memory,
    instance,
  });

  if (coach.action === "select_option" && typeof coach.optionId === "number") {
    return {
      kind: "select_option",
      optionId: coach.optionId,
      flowContext: coach.flowContext || flowContext,
    };
  }
  if (coach.action === "continue_value") {
    return {
      kind: "continue_value",
      mappedValue: coach.mappedValue,
      flowContext: coach.flowContext || flowContext,
    };
  }
  if (
    coach.action === "propose_navigate" ||
    coach.action === "navigate" ||
    coach.action === "cancel_navigate"
  ) {
    return {
      kind: coach.action,
      targetStep: coach.targetStep,
      message: coach.message,
      flowContext: coach.flowContext || flowContext,
    };
  }
  if (
    coach.action === "answer" ||
    coach.action === "offer_human" ||
    coach.action === "guide"
  ) {
    return {
      kind: coach.action,
      message: coach.message,
      wantSchedule: Boolean(coach.wantSchedule),
      flowContext: coach.flowContext || flowContext,
    };
  }
  if (coach.action === "reminder" && coach.message) {
    return {
      kind: "reminder",
      message: coach.message,
      flowContext: coach.flowContext || flowContext,
    };
  }

  return {
    kind: "reminder",
    message: processConfusionReply(number, reminderBase, instance),
    flowContext,
  };
}

/**
 * Tenta interpretar mensagem dentro do fluxo ativo (regex local + Gemini).
 * @param {object} params
 * @returns {Promise<number | null>} optionId quando aplicável
 */
export async function resolveFlowOptionChoice(params) {
  const { flowContext, userMessage } = params;
  if (!flowContext?.options?.length) return null;

  const choice = await resolveOptionChoice({
    state: flowContext.state,
    options: flowContext.options,
    userMessage,
  });
  if (choice !== null) return choice;

  if (!isGeminiConfigured()) return null;

  const intent = await parseFlowIntent(flowContext, userMessage);
  if (
    intent?.action === "select_option" &&
    typeof intent.optionId === "number" &&
    intent.confidence >= 0.6 &&
    flowContext.options.some((o) => o.id === intent.optionId)
  ) {
    return intent.optionId;
  }

  return null;
}

/**
 * @param {object} params
 * @returns {Promise<{
 *   handled: boolean,
 *   optionId?: number,
 *   reminder?: string,
 *   coachAction?: string,
 *   coachMessage?: string,
 *   wantSchedule?: boolean,
 *   mappedValue?: string,
 *   flowContext?: object,
 * }>}
 */
export async function handleUnknownInActiveFlow(params) {
  const { db, number, userMessage, memory, instance = "" } = params;
  const text = String(userMessage || "").trim();
  if (!text) {
    const ctx = detectFlowContext(db, number, memory, instance);
    return {
      handled: true,
      reminder: processConfusionReply(number, getFlowReminderMessage(ctx), instance),
    };
  }

  const flowContext = detectFlowContext(db, number, memory, instance);
  if (!flowContext) return { handled: false };

  if (flowContext.options?.length) {
    const optionId = await resolveFlowOptionChoice({ flowContext, userMessage: text });
    if (optionId !== null) {
      return { handled: true, optionId, flowContext };
    }
  }

  const shouldCoach =
    looksLikeQuestion(text) ||
    looksConfused(text) ||
    !flowContext.options?.length ||
    Boolean(flowContext.options?.length);

  if (shouldCoach) {
    const coach = await handleAiCoachTurn({
      db,
      number,
      text,
      flowContext,
      memory,
      instance,
    });

    if (coach.action === "select_option" && typeof coach.optionId === "number") {
      return { handled: true, optionId: coach.optionId, flowContext: coach.flowContext || flowContext };
    }
    if (coach.action === "continue_value") {
      return {
        handled: true,
        mappedValue: coach.mappedValue,
        flowContext: coach.flowContext || flowContext,
        coachAction: "continue_value",
      };
    }
    if (coach.action === "propose_navigate" || coach.action === "navigate" || coach.action === "cancel_navigate") {
      return {
        handled: true,
        coachAction: coach.action,
        coachMessage: coach.message,
        targetStep: coach.targetStep,
        flowContext: coach.flowContext || flowContext,
      };
    }
    if (coach.action === "answer") {
      return {
        handled: true,
        coachAction: "answer",
        coachMessage: coach.message,
        flowContext: coach.flowContext || flowContext,
      };
    }
    if (coach.action === "offer_human") {
      return {
        handled: true,
        coachAction: "offer_human",
        coachMessage: coach.message,
        flowContext: coach.flowContext || flowContext,
      };
    }
    if (coach.action === "guide") {
      return {
        handled: true,
        coachAction: "guide",
        coachMessage: coach.message,
        wantSchedule: Boolean(coach.wantSchedule),
        flowContext: coach.flowContext || flowContext,
      };
    }
    if (coach.action === "reminder" && coach.message) {
      return {
        handled: true,
        reminder: coach.message,
        flowContext: coach.flowContext || flowContext,
      };
    }
  }

  return {
    handled: true,
    reminder: processConfusionReply(number, getFlowReminderMessage(flowContext), instance),
    flowContext,
  };
}

export { detectFlowContext, getFlowReminderMessage };
