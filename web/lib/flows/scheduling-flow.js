import { getPendingSchedule, upsertPendingSchedule } from "@/lib/flows/flow-store";
import { resolveSlotChoice } from "@/lib/conversation-intent";
import { parseSlotRequest } from "@/lib/gemini";
import { formatBRL, parseCurrencyToNumber } from "@/lib/currency";
import { buildLeadSummary } from "@/lib/flows/client-data-flow";
import { sendToSecretaries } from "@/lib/secretary-notify";
import { filterSlots, paginateSlots, formatSlotsMessage } from "@/lib/slot-filters";
import { processConfusionReply, resetConfusion } from "@/lib/human-handoff";

export async function handleSchedulingFlow(ctx) {
  const { number, text, db, sendText, settings, instance = "" } = ctx;
  const schedule = getPendingSchedule(db, number, instance);
  if (!schedule || schedule.step !== "slot_choice") return false;

  const allSlots = Array.isArray(schedule.allSlots) ? schedule.allSlots : [];
  const filteredSlots = Array.isArray(schedule.filteredSlots) ? schedule.filteredSlots : null;
  const activePool = filteredSlots?.length ? filteredSlots : allSlots;
  let visibleSlots = Array.isArray(schedule.visibleSlots) ? schedule.visibleSlots : activePool.slice(0, 8);
  let slotPage = typeof schedule.slotPage === "number" ? schedule.slotPage : 0;

  const trimmed = String(text || "").trim();
  if (!trimmed) {
    await sendText(number, "Escolha um horário pelo número ou descreva quando prefere (ex: sexta, semana que vem).");
    return true;
  }

  const chosenId = await resolveSlotChoice(trimmed, visibleSlots);
  if (chosenId) {
    const slot = visibleSlots.find((s) => s.id === chosenId);
    if (slot) {
      resetConfusion(number, instance);
      return proceedToPix(ctx, schedule, slot);
    }
  }

  const slotRequest = (await parseSlotRequest(trimmed, settings?.scheduling)) || { intent: "unknown" };

  if (slotRequest.intent === "show_more" && activePool.length) {
    slotPage += 1;
    const { pageSlots, hasMore } = paginateSlots(activePool, slotPage, 8);
    if (!pageSlots.length) {
      await sendText(number, "Não há mais horários nesta lista. Tente filtrar: ex. sexta, semana que vem.");
      return true;
    }
    await upsertPendingSchedule(
      number,
      { ...schedule, visibleSlots: pageSlots, slotPage, slotHasMore: hasMore },
      instance,
    );
    await sendText(number, formatSlotsMessage(pageSlots, hasMore ? 'Digite "mais horários" para continuar.' : ""));
    return true;
  }

  if (slotRequest.intent === "refine_dates" && allSlots.length) {
    const filtered = filterSlots(allSlots, {
      dateStart: slotRequest.dateStart,
      dateEnd: slotRequest.dateEnd,
      weekdays: slotRequest.weekdays,
    });
    if (!filtered.length) {
      await sendText(
        number,
        "Não achei horários nesse período dentro da agenda configurada. Tente outra data ou diga *mais horários*.",
      );
      return true;
    }
    const { pageSlots, hasMore } = paginateSlots(filtered, 0, 8);
    await upsertPendingSchedule(
      number,
      {
        ...schedule,
        visibleSlots: pageSlots,
        filteredSlots: filtered,
        slotPage: 0,
        slotHasMore: hasMore,
        lastFilter: slotRequest,
      },
      instance,
    );
    await sendText(number, formatSlotsMessage(pageSlots, hasMore ? 'Digite "mais horários" para ver mais neste filtro.' : ""));
    return true;
  }

  await sendText(
    number,
    processConfusionReply(
      number,
      `Não entendi. Escolha pelo número ou diga "sexta", "semana que vem".\n\n${formatSlotsMessage(visibleSlots)}`,
      instance,
    ),
  );
  return true;
}

async function proceedToPix(ctx, schedule, slot) {
  const { number, sendText, settings, instance = "" } = ctx;
  const pixAmount = parseCurrencyToNumber(settings?.pixFixedAmount);
  const pixKey = settings?.pixKey?.trim() || "";

  if (!pixKey || pixAmount <= 0) {
    await sendText(
      number,
      "O agendamento online ainda não está configurado (PIX/chave no painel). A secretaria vai entrar em contato.",
    );
    return true;
  }

  await upsertPendingSchedule(
    number,
    {
      ...schedule,
      step: "pix",
      slotStart: slot.start,
      slotEnd: slot.end,
      slotLabel: slot.label,
      slotId: slot.id,
      pixStatus: "Aguardando pagamento",
    },
    instance,
  );

  const { upsertPendingPayment } = await import("@/lib/flows/flow-store");
  await upsertPendingPayment(
    number,
    {
      amountRequired: pixAmount,
      amountPaid: 0,
      pixKeyVerified: false,
      slotStart: slot.start,
      slotEnd: slot.end,
      slotLabel: slot.label,
      scheduleData: {
        clientName: schedule.clientName || schedule.fullName,
        clientPhone: schedule.clientPhone || number,
        tattooLocation: schedule.tattooLocation,
        selectedAreas: schedule.selectedAreas,
        estimatedTotal: schedule.estimatedTotal,
      },
    },
    instance,
  );

  const pixHolder = settings?.pixHolderName?.trim() || "";
  const pixInstructions = settings?.pixInstructions?.trim() || "";
  let pixMessage = `Horário reservado: ${slot.label} 📅\n\nFaça o PIX do sinal:\n💰 Valor: ${formatBRL(pixAmount)}`;
  if (pixHolder) pixMessage += `\n👤 Recebedor: ${pixHolder}`;
  pixMessage += `\n🔑 Chave PIX: ${pixKey}`;
  if (pixInstructions) pixMessage += `\n\n${pixInstructions}`;
  pixMessage += "\n\n📸 Envie o comprovante (imagem) aqui.";

  await sendText(number, pixMessage);

  await sendToSecretaries(
    sendText,
    settings,
    buildLeadSummary(
      { ...schedule, number, slotLabel: slot.label, pixStatus: "Aguardando pagamento" },
      settings,
    ),
  );

  return true;
}
