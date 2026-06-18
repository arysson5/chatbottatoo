import { detectFlowContext, getFlowReminderMessage } from "@/lib/flow-context";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { parseFlowIntent, isGeminiConfigured } from "@/lib/gemini";
import { processConfusionReply } from "@/lib/human-handoff";

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
 * @returns {Promise<{ handled: boolean, optionId?: number, reminder?: string }>}
 */
export async function handleUnknownInActiveFlow(params) {
  const { db, number, userMessage, memory } = params;
  const text = String(userMessage || "").trim();
  if (!text) {
    const ctx = detectFlowContext(db, number, memory);
    return {
      handled: true,
      reminder: processConfusionReply(number, getFlowReminderMessage(ctx)),
    };
  }

  const flowContext = detectFlowContext(db, number, memory);
  if (!flowContext) return { handled: false };

  if (flowContext.options?.length) {
    const optionId = await resolveFlowOptionChoice({ flowContext, userMessage: text });
    if (optionId !== null) {
      return { handled: true, optionId, flowContext };
    }
  }

  if (isGeminiConfigured()) {
    const intent = await parseFlowIntent(flowContext, text);
    if (intent?.action === "provide_data" && intent.confidence >= 0.65) {
      return { handled: false, allowPassthrough: true, flowContext };
    }
  }

  return {
    handled: true,
    reminder: processConfusionReply(number, getFlowReminderMessage(flowContext)),
    flowContext,
  };
}

export { detectFlowContext, getFlowReminderMessage };
