import {
  getPendingPayment,
  getPendingSchedule,
  upsertPendingPayment,
  removePendingPayment,
  removePendingSchedule,
  saveAppointment,
} from "@/lib/flows/flow-store";
import { resolveMessageMedia } from "@/lib/evolution-media";
import { PIX_RECEIPT_MIN_CONFIDENCE } from "@/lib/gemini";
import { formatBRL, parseCurrencyToNumber } from "@/lib/currency";
import { verifyPixProofRecipient } from "@/lib/pix-key";
import { createCalendarEvent } from "@/lib/google-calendar";
import { buildLeadSummary } from "@/lib/flows/client-data-flow";
import { sendToSecretaries } from "@/lib/secretary-notify";
import { detectPixProofMedia, mimeForGeminiProof } from "@/lib/message-media";
import { resetConfusion } from "@/lib/human-handoff";
import { resolveUnexpectedMessage } from "@/lib/flow-router";
import { analyzePixProof } from "@/lib/pix-proof-pipeline";
import {
  findUsedPixTransaction,
  registerUsedPixTransaction,
  updateDb,
} from "@/lib/simple-db";

function parseManualAmount(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;
  const match = normalized.match(/(\d+[.,]?\d*)/);
  if (!match) return null;
  return parseCurrencyToNumber(match[1]);
}

/**
 * @param {object} db
 * @param {string} transactionId
 * @param {string} currentNumber
 * @returns {boolean}
 */
function isDuplicateTransaction(db, transactionId, currentNumber) {
  const id = String(transactionId || "").trim();
  if (!id) return false;

  const used = findUsedPixTransaction(db, id);
  if (used && used.number !== currentNumber) return true;

  const pendingList = Array.isArray(db?.pendingPayments) ? db.pendingPayments : [];
  const pendingDuplicate = pendingList.some(
    (item) =>
      item?.number !== currentNumber &&
      String(item?.pixTransactionId || "").trim().toUpperCase() === id.toUpperCase(),
  );

  return pendingDuplicate;
}

export async function handlePixFlow(ctx) {
  const { number, text, db, message, key, sendText, settings, evolutionBase, instance = "", apiKey } = ctx;
  const payment = getPendingPayment(db, number, instance);
  const schedule = getPendingSchedule(db, number, instance);
  if (!payment) return false;

  const amountRequired =
    typeof payment.amountRequired === "number"
      ? payment.amountRequired
      : parseCurrencyToNumber(settings?.pixFixedAmount);
  const expectedHolderName = settings?.pixHolderName?.trim() || "";
  let amountPaid = typeof payment.amountPaid === "number" ? payment.amountPaid : 0;
  let recipientVerified = Boolean(payment.recipientVerified ?? payment.pixKeyVerified);
  let manualAmountUsed = Boolean(payment.manualAmountUsed);
  let verifiedByReceipt = Boolean(payment.verifiedByReceipt);
  let pixTransactionId = String(payment.pixTransactionId || "").trim();

  const mediaInfo = detectPixProofMedia(message);
  const trimmed = String(text || "").trim();

  if (mediaInfo && !key) {
    await sendText(
      number,
      "Recebi o arquivo, mas não consegui processá-lo. Reenvie o comprovante ou digite o valor pago.",
    );
    return true;
  }

  if (mediaInfo && key) {
    const media = await resolveMessageMedia(evolutionBase, instance, apiKey, {
      key,
      message,
    });

    if (!media) {
      await sendText(
        number,
        "Não consegui baixar o comprovante. Reenvie como foto ou digite o valor pago.",
      );
      return true;
    }

    const proofMime = mimeForGeminiProof(media.mimetype || mediaInfo.mimetype);
    const proof = await analyzePixProof({
      base64: media.base64,
      mimetype: proofMime,
      expectedHolderName,
    });

    if (proof?.error === "quota") {
      console.warn("[pix-flow] gemini quota esgotada", { number });
      await sendText(
        number,
        `Recebi sua imagem ✅, mas a leitura automática está temporariamente indisponível (limite da API Gemini).\n\nDigite o valor pago (ex: ${formatBRL(amountRequired).replace("R$", "").trim()}) para confirmar, ou aguarde alguns minutos e reenvie o comprovante.`,
      );
      return true;
    }

    if (proof?.error || !proof) {
      console.warn("[pix-flow] análise indisponível", { number, error: proof?.error });
      await sendText(
        number,
        "Recebi a imagem, mas não consegui analisá-la agora. Digite o valor pago (ex: 75,00) ou reenvie o comprovante em instantes.",
      );
      return true;
    }

    console.log("[pix-flow] análise comprovante", {
      number,
      verificationSource: proof.verificationSource,
      isPixReceipt: proof.isPixReceipt,
      receiptConfidence: proof.receiptConfidence,
      recipientName: proof.recipientName,
      nameMatchesExpected: proof.nameMatchesExpected,
      amount: proof.amount,
      transactionId: proof.transactionId,
    });

    if (!proof.isPixReceipt || proof.receiptConfidence < PIX_RECEIPT_MIN_CONFIDENCE) {
      await sendText(
        number,
        "Isso não parece um comprovante de PIX 📄\nReenvie a foto ou print do comprovante de transferência.",
      );
      return true;
    }

    if (proof.transactionId && isDuplicateTransaction(db, proof.transactionId, number)) {
      await sendText(
        number,
        "Este comprovante já foi utilizado. Envie outro ou fale com a secretaria.",
      );
      return true;
    }

    if (proof.amount > 0) {
      amountPaid += proof.amount;
    } else {
      await sendText(
        number,
        "Identifiquei o comprovante, mas não achei o valor. Digite o valor pago (ex: 75,00) ou reenvie a imagem.",
      );
      return true;
    }

    const recipientCheck = verifyPixProofRecipient(proof, settings);
    if (expectedHolderName && !recipientCheck.verified) {
      await sendText(
        number,
        `⚠️ O recebedor no comprovante não confere.\nEsperado: *${expectedHolderName}*\nEncontrado: ${proof.recipientName || "não identificado"}\n\nReenvie o comprovante correto.`,
      );
      await upsertPendingPayment(number, {
        ...payment,
        amountPaid,
        recipientVerified: false,
        pixKeyVerified: false,
        verifiedByReceipt: false,
        pixTransactionId: proof.transactionId || pixTransactionId,
      }, instance);
      return true;
    }

    recipientVerified = true;
    verifiedByReceipt = true;
    pixTransactionId = proof.transactionId || pixTransactionId;

    await upsertPendingPayment(number, {
      ...payment,
      amountPaid,
      recipientVerified: true,
      pixKeyVerified: true,
      verifiedByReceipt: true,
      pixTransactionId,
    }, instance);
  } else if (trimmed) {
    const manual = parseManualAmount(trimmed);
    if (manual !== null && manual > 0) {
      amountPaid += manual;
      manualAmountUsed = true;
      recipientVerified = recipientVerified || !expectedHolderName;
      await upsertPendingPayment(number, {
        ...payment,
        amountPaid,
        manualAmountUsed: true,
        recipientVerified,
        pixKeyVerified: recipientVerified,
        verifiedByReceipt,
        pixTransactionId,
      }, instance);
    } else if (!mediaInfo) {
      await sendText(
        number,
        `Aguardando comprovante PIX de ${formatBRL(amountRequired)} para ${expectedHolderName || "o recebedor cadastrado"}.\nVocê também pode digitar só o valor pago (ex: 75,00).`,
      );
      return true;
    } else {
      await sendText(
        number,
        `Recebi a imagem. Se a leitura automática falhar, digite o valor pago (ex: ${formatBRL(amountRequired).replace("R$", "").trim()}).`,
      );
      return true;
    }
  } else {
    if (trimmed) {
      const unexpected = await resolveUnexpectedMessage({
        db,
        number,
        text: trimmed,
        instance,
        flowContext: {
          state: "pix_comprovante",
          step: "pix",
          description: "Cliente deve enviar comprovante PIX (imagem) do sinal.",
          options: [],
        },
        fallbackReminder: `Envie o comprovante PIX (foto ou PDF) do sinal de ${formatBRL(amountRequired)}.`,
      });
      if (unexpected.kind === "answer" || unexpected.kind === "offer_human") {
        await sendText(number, unexpected.message);
        return true;
      }
    }
    await sendText(
      number,
      `Envie o comprovante PIX (foto ou PDF) do sinal de ${formatBRL(amountRequired)}.`,
    );
    return true;
  }

  const remaining = Math.max(0, amountRequired - amountPaid);

  if (remaining > 0.01) {
    await sendText(
      number,
      `Recebi ${formatBRL(amountPaid)} no total. Faltam ${formatBRL(remaining)} para confirmar.\nEnvie o complemento ou novo comprovante.`,
    );
    return true;
  }

  if (expectedHolderName && !recipientVerified) {
    await sendText(
      number,
      `Valor ok, mas preciso confirmar que o PIX foi para *${expectedHolderName}*. Reenvie o comprovante.`,
    );
    return true;
  }

  const scheduleData = payment.scheduleData || {};
  const clientName = scheduleData.clientName || schedule?.clientName || "Cliente";
  const clientPhone = scheduleData.clientPhone || schedule?.clientPhone || number;
  const tattooLocation = scheduleData.tattooLocation || schedule?.tattooLocation || "";
  const slotStart = payment.slotStart || schedule?.slotStart;
  const slotEnd = payment.slotEnd || schedule?.slotEnd;
  const slotLabel = payment.slotLabel || schedule?.slotLabel || "";

  const pixVerificationMethod = manualAmountUsed && !verifiedByReceipt ? "manual" : "receipt";

  let calendarEventId = null;
  if (slotStart && slotEnd) {
    calendarEventId = await createCalendarEvent({
      clientName,
      clientPhone,
      tattooLocation,
      slotStart,
      slotEnd,
      whatsappNumber: number,
    });
  }

  if (pixTransactionId) {
    await updateDb((draft) => {
      registerUsedPixTransaction(draft, pixTransactionId, number);
      return draft;
    });
  }

  await saveAppointment({
    number,
    clientName,
    clientPhone,
    tattooLocation,
    slotStart,
    slotEnd,
    slotLabel,
    calendarEventId,
    pixPaidAt: new Date().toISOString(),
    amountPaid,
    amountRequired,
    status: "confirmed",
    selectedAreas: scheduleData.selectedAreas || schedule?.selectedAreas || [],
    estimatedTotal: scheduleData.estimatedTotal || schedule?.estimatedTotal || 0,
    pixVerificationMethod,
    pixTransactionId: pixTransactionId || "",
    manualAmountUsed,
  });

  const clientMessage =
    pixVerificationMethod === "manual"
      ? `Pagamento confirmado! 🎉\nHorário marcado: ${slotLabel}\nNossa equipe pode entrar em contato para confirmar o pagamento.\nAté lá! 🔥`
      : `Pagamento confirmado! 🎉\nHorário marcado: ${slotLabel}\nAté lá! 🔥`;

  await sendText(number, clientMessage);

  await sendToSecretaries(
    sendText,
    settings,
    `✅ AGENDAMENTO CONFIRMADO\n\n${buildLeadSummary(
      {
        number,
        clientName,
        clientPhone,
        tattooLocation,
        slotLabel,
        pixStatus: `Pago ${formatBRL(amountPaid)}`,
        selectedAreas: scheduleData.selectedAreas || [],
        estimatedTotal: scheduleData.estimatedTotal || 0,
      },
      settings,
    )}`,
  );

  if (pixVerificationMethod === "manual") {
    await sendToSecretaries(
      sendText,
      settings,
      `⚠️ PIX INFORMADO MANUALMENTE — CONFERIR\nCliente: ${clientName} (${clientPhone})\nHorário: ${slotLabel}\nValor informado: ${formatBRL(amountPaid)}\nAção: conferir comprovante/extrato e validar pagamento.`,
    );
  }

  await removePendingPayment(number, instance);
  await removePendingSchedule(number, instance);
  resetConfusion(number, instance);
  return true;
}

export function isInPixFlow(db, number, instance = "") {
  const payment = getPendingPayment(db, number, instance);
  const schedule = getPendingSchedule(db, number, instance);
  return Boolean(payment || schedule?.step === "pix");
}
