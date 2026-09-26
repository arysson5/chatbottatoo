import { detectFlowContext, getFlowReminderMessage } from "@/lib/flow-context";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { parseFlowIntent, isGeminiConfigured } from "@/lib/gemini";
import { processConfusionReply } from "@/lib/human-handoff";
import { handleAiCoachTurn, looksLikeQuestion, looksConfused } from "@/lib/ai-flow-coach";

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
