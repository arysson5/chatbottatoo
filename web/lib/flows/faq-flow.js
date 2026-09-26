import { getPendingSchedule, upsertPendingSchedule, removePendingSchedule } from "@/lib/flows/flow-store";
import { matchLocalFaqAnswer, FAQ_MENU_TEXT } from "@/lib/faq-tattoo-tribal";
import { answerTattooFaq, isGeminiConfigured } from "@/lib/gemini";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { askClientName, startClientDataFlow } from "@/lib/flows/client-data-flow";
import { resetConfusion, offerHumanChoice } from "@/lib/human-handoff";
import { resolveUnexpectedMessage } from "@/lib/flow-router";
import {
  getPendingNavConfirm,
  detectNavigationIntent,
} from "@/lib/flow-navigation";

const FAQ_UNKNOWN_CLIENT_MSG =
  "Boa pergunta! Não tenho essa resposta com segurança agora. Quer que um atendente humano te ajude?";

export async function handleFaqFlow(ctx) {
  const { number, text, db, sendText, clientName, instance = "", memory } = ctx;
  const schedule = getPendingSchedule(db, number, instance);
  if (!schedule || schedule.step !== "faq") return false;

  const trimmed = String(text || "").trim();
  if (!trimmed) {
    await sendText(number, FAQ_MENU_TEXT);
    return true;
  }

  // Confirmação de navegação ou comando de voltar/corrigir (caso do print)
  if (getPendingNavConfirm(number, instance) || detectNavigationIntent(trimmed, {
    state: "faq_pos_orcamento",
    step: "faq",
    options: [
      { id: 1, label: "Agendar agora" },
      { id: 2, label: "Outra pergunta" },
    ],
  })) {
    const unexpected = await resolveUnexpectedMessage({
      db,
      number,
      text: trimmed,
      instance,
      memory,
      flowContext: {
        state: "faq_pos_orcamento",
        step: "faq",
        description: "Cliente tirando dúvidas pós-orçamento sobre tattoo tribal.",
        options: [
          { id: 1, label: "Agendar agora" },
          { id: 2, label: "Outra pergunta" },
        ],
      },
      fallbackReminder: FAQ_MENU_TEXT,
    });
    if (
      unexpected.kind === "propose_navigate" ||
      unexpected.kind === "cancel_navigate"
    ) {
      if (unexpected.message) await sendText(number, unexpected.message);
      return true;
    }
    if (unexpected.kind === "navigate" && unexpected.targetStep && ctx.onNavigate) {
      await ctx.onNavigate(unexpected.targetStep);
      return true;
    }
    if (unexpected.message && unexpected.kind !== "select_option") {
      await sendText(number, unexpected.message);
      return true;
    }
  }

  const choice = await resolveOptionChoice({
    state: "faq_pos_orcamento",
    options: [
      { id: 1, label: "Agendar agora" },
      { id: 2, label: "Outra pergunta" },
    ],
    userMessage: trimmed,
  });

  if (choice === 1 || /^(agendar|quero agendar|marcar)$/.test(trimmed.toLowerCase())) {
    resetConfusion(number, instance);
    const quoteContext = {
      selectedAreas: schedule.selectedAreas || [],
      estimatedTotal: schedule.estimatedTotal || 0,
      quoteIssuedAt: schedule.quoteIssuedAt || null,
      quoteExpiresAt: schedule.quoteExpiresAt || null,
      instance: schedule.instance || instance || "",
    };
    await removePendingSchedule(number, instance);
    await startClientDataFlow(
      quoteContext,
      number,
      clientName,
      schedule.instance || instance || "",
      ctx.pricingTable,
    );
    await askClientName(sendText, number, clientName);
    return true;
  }

  if (choice === 2) {
    await sendText(number, "Pode mandar sua dúvida! 💬");
    return true;
  }

  const faqEntries = db?.settings?.faqEntries;
  let answer = matchLocalFaqAnswer(trimmed, faqEntries);
  if (!answer && isGeminiConfigured()) {
    answer = await answerTattooFaq(
      trimmed,
      {
        selectedAreas: schedule.selectedAreas,
        estimatedTotal: schedule.estimatedTotal,
      },
      faqEntries,
    );
  }
  if (!answer) {
    // Tenta navegação / coach antes do handoff genérico
    const unexpected = await resolveUnexpectedMessage({
      db,
      number,
      text: trimmed,
      instance,
      memory,
      flowContext: {
        state: "faq_pos_orcamento",
        step: "faq",
        description: "Cliente tirando dúvidas pós-orçamento.",
        options: [
          { id: 1, label: "Agendar agora" },
          { id: 2, label: "Outra pergunta" },
        ],
      },
      fallbackReminder: FAQ_MENU_TEXT,
    });
    if (unexpected.kind === "propose_navigate" || unexpected.kind === "cancel_navigate") {
      if (unexpected.message) await sendText(number, unexpected.message);
      return true;
    }
    if (unexpected.kind === "navigate" && unexpected.targetStep && ctx.onNavigate) {
      await ctx.onNavigate(unexpected.targetStep);
      return true;
    }
    if (unexpected.kind === "answer" && unexpected.message) {
      await sendText(number, unexpected.message);
      return true;
    }
    await sendText(
      number,
      offerHumanChoice(number, FAQ_UNKNOWN_CLIENT_MSG, instance),
    );
    return true;
  }

  resetConfusion(number, instance);
  await sendText(number, `${answer}\n\n${FAQ_MENU_TEXT}`);
  return true;
}

export async function startFaqFlow(quoteContext, number, clientName, instance, sendText) {
  await upsertPendingSchedule(
    number,
    {
      step: "faq",
      clientName,
      instance,
      selectedAreas: quoteContext.selectedAreas || [],
      estimatedTotal: quoteContext.estimatedTotal || 0,
      quoteIssuedAt: quoteContext.quoteIssuedAt || null,
      quoteExpiresAt: quoteContext.quoteExpiresAt || null,
    },
    instance,
  );
  await sendText(number, FAQ_MENU_TEXT);
}
