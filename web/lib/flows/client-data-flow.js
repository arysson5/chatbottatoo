import {
  getPendingSchedule,
  upsertPendingSchedule,
  removePendingSchedule,
} from "@/lib/flows/flow-store";
import {
  listFreeSlots,
  isGoogleCalendarConnected,
} from "@/lib/google-calendar";
import { formatBRL } from "@/lib/currency";
import { formatTattooLocation } from "@/lib/pricing-areas";
import { sendToSecretaries } from "@/lib/secretary-notify";
import { parsePhoneResponse } from "@/lib/gemini";
import { formatSlotsMessage } from "@/lib/slot-filters";
import { processConfusionReply, resetConfusion } from "@/lib/human-handoff";
import { resolveUnexpectedMessage } from "@/lib/flow-router";

export function buildLeadSummary(schedule, settings) {
  const areas = Array.isArray(schedule.selectedAreas) ? schedule.selectedAreas.join(", ") : "-";
  const slotLabel = schedule.slotLabel || "A definir";
  const pixStatus = schedule.pixStatus || "Pendente";
  return `📋 Agendamento em andamento
Nome: ${schedule.clientName || "-"}
Telefone: ${schedule.clientPhone || "-"}
Local da tattoo: ${schedule.tattooLocation || "-"}
WhatsApp: ${schedule.number}
Orçamento: ${formatBRL(schedule.estimatedTotal || 0)} | Áreas catálogo: ${areas}
Horário escolhido: ${slotLabel}
PIX: ${pixStatus}
Origem: Bot Briza Tattoo`;
}

export async function handleClientDataFlow(ctx) {
  const { number, text, db, sendText, settings, instance = "" } = ctx;
  const schedule = getPendingSchedule(db, number, instance);
  if (!schedule || schedule.step === "slot_choice" || schedule.step === "pix" || schedule.step === "faq") {
    return false;
  }
  if (!["name", "phone"].includes(schedule.step)) return false;

  const trimmed = String(text || "").trim();
  if (!trimmed) {
    await sendText(number, "Por favor, envie sua resposta por texto.");
    return true;
  }

  const pricingTable = Array.isArray(ctx.pricingTable) ? ctx.pricingTable : [];

  if (schedule.step === "name") {
    resetConfusion(number, instance);
    await upsertPendingSchedule(number, {
      ...schedule,
      step: "phone",
      fullName: trimmed,
      clientName: trimmed,
    }, instance);
    await sendText(
      number,
      `Obrigado, ${trimmed}! 📱\nQual seu telefone para contato?\n(Pode dizer "é o mesmo número" se for este WhatsApp)`,
    );
    return true;
  }

  if (schedule.step === "phone") {
    let phone = number;
    const parsed = await parsePhoneResponse(trimmed, number);
    if (parsed?.useSameNumber && parsed.confidence >= 0.6) {
      phone = number;
    } else if (parsed?.phone && parsed.phone.length >= 10) {
      phone = parsed.phone;
    } else {
      const digits = trimmed.replace(/\D/g, "");
      if (digits.length >= 10 && digits.length <= 13) {
        phone = digits;
      } else {
        const unexpected = await resolveUnexpectedMessage({
          db,
          number,
          text: trimmed,
          instance,
          flowContext: {
            state: "coleta_telefone",
            step: "phone",
            description: "Cliente deve informar telefone ou dizer que é o mesmo do WhatsApp.",
            options: [],
          },
          fallbackReminder:
            'Não entendi o telefone. Envie com DDD (ex: 11999998888) ou diga "é o mesmo número".',
        });
        await sendText(
          number,
          unexpected.message ||
            'Não entendi o telefone. Envie com DDD (ex: 11999998888) ou diga "é o mesmo número".',
        );
        return true;
      }
    }

    resetConfusion(number, instance);
    const tattooLocation = formatTattooLocation(schedule.selectedAreas, pricingTable);
    const updated = {
      ...schedule,
      step: "slot_choice",
      clientPhone: phone,
      clientName: schedule.fullName || schedule.clientName || "Cliente",
      tattooLocation,
    };
    await upsertPendingSchedule(number, updated, instance);

    await sendToSecretaries(sendText, settings, buildLeadSummary({ ...updated, number }, settings));

    if (!isGoogleCalendarConnected(settings?.googleCalendar)) {
      await sendText(
        number,
        "Recebi seus dados! ✅\nA agenda ainda não está conectada. A secretaria vai entrar em contato.",
      );
      await removePendingSchedule(number, instance);
      return true;
    }

    const allSlots = await listFreeSlots(settings?.scheduling);
    if (!allSlots.length) {
      await sendText(number, "Recebi seus dados! ✅\nNo momento não há horários disponíveis.");
      await removePendingSchedule(number, instance);
      return true;
    }

    const { pageSlots, hasMore } = paginateFirst(allSlots);
    await upsertPendingSchedule(number, {
      ...updated,
      allSlots,
      visibleSlots: pageSlots,
      slotPage: 0,
      slotHasMore: hasMore,
    }, instance);

    await sendText(
      number,
      `Ótimo, ${updated.clientName}! ✅\nLocal: ${tattooLocation}\n\nAgora escolha o horário:\n\n${formatSlotsMessage(pageSlots, hasMore ? '\nDigite "mais horários" para ver outros.' : "")}`,
    );
    return true;
  }

  return false;
}

function paginateFirst(allSlots, pageSize = 8) {
  const pageSlots = allSlots.slice(0, pageSize).map((s, idx) => ({ ...s, id: idx + 1 }));
  return { pageSlots, hasMore: allSlots.length > pageSize };
}

export async function startClientDataFlow(quoteContext, number, clientName, instance, pricingTable) {
  const tattooLocation = formatTattooLocation(quoteContext.selectedAreas, pricingTable || []);
  await upsertPendingSchedule(number, {
    step: "name",
    clientName,
    instance,
    selectedAreas: quoteContext.selectedAreas || [],
    estimatedTotal: quoteContext.estimatedTotal || 0,
    quoteIssuedAt: quoteContext.quoteIssuedAt || null,
    quoteExpiresAt: quoteContext.quoteExpiresAt || null,
    tattooLocation,
  }, instance);
}

export async function askClientName(sendText, number, clientName) {
  await sendText(
    number,
    `Perfeito, ${clientName}! ✅\nVamos agendar sua sessão.\n\nQual seu nome completo?`,
  );
}
