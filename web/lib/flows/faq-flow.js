import { getPendingSchedule, upsertPendingSchedule, removePendingSchedule } from "@/lib/flows/flow-store";
import { matchLocalFaqAnswer, FAQ_MENU_TEXT } from "@/lib/faq-tattoo-tribal";
import { answerTattooFaq, isGeminiConfigured } from "@/lib/gemini";
import { resolveOptionChoice } from "@/lib/conversation-intent";
import { askClientName, startClientDataFlow } from "@/lib/flows/client-data-flow";
import { resetConfusion } from "@/lib/human-handoff";

export async function handleFaqFlow(ctx) {
  const { number, text, db, sendText, clientName, instance = "" } = ctx;
  const schedule = getPendingSchedule(db, number, instance);
  if (!schedule || schedule.step !== "faq") return false;

  const trimmed = String(text || "").trim();
  if (!trimmed) {
    await sendText(number, FAQ_MENU_TEXT);
    return true;
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

  let answer = matchLocalFaqAnswer(trimmed);
  if (!answer && isGeminiConfigured()) {
    answer = await answerTattooFaq(trimmed, {
      selectedAreas: schedule.selectedAreas,
      estimatedTotal: schedule.estimatedTotal,
    });
  }
  if (!answer) {
    answer =
      "Boa pergunta! Para esse detalhe, o artista confirma no atendimento. Quer agendar? Digite 1 ou AGENDAR. 📅";
  }

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
