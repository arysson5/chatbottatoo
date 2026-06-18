import { getPendingSchedule, getPendingPayment } from "@/lib/flows/flow-store";

/**
 * @param {object} memory
 * @param {Map<string, unknown>} memory.pendingPostQuoteChoiceByNumber
 * @param {Map<string, unknown>} memory.pendingCatalogAreasByNumber
 * @param {Map<string, unknown>} memory.pendingHandoffAreasByNumber
 * @param {Map<string, unknown>} memory.pendingHandoffPhotosByNumber
 * @param {Map<string, unknown>} memory.pendingPollByNumber
 * @param {(number: string) => boolean} memory.hasPendingPoll
 */
export function detectFlowContext(db, number, memory) {
  const schedule = getPendingSchedule(db, number);
  const payment = getPendingPayment(db, number);

  if (payment || schedule?.step === "pix") {
    return {
      state: "pix_comprovante",
      step: "pix",
      description: "Cliente deve enviar comprovante PIX (imagem) do sinal de agendamento.",
      options: [],
    };
  }

  if (schedule?.step === "faq") {
    return {
      state: "faq_pos_orcamento",
      step: "faq",
      description: "Cliente tirando dúvidas pós-orçamento sobre tattoo tribal.",
      options: [
        { id: 1, label: "Agendar agora" },
        { id: 2, label: "Outra pergunta" },
      ],
    };
  }

  if (schedule?.step === "slot_choice") {
    return {
      state: "escolha_horario",
      step: "slot_choice",
      description: "Cliente escolhendo horário na agenda. Pode responder número, sexta, semana que vem ou mais horários.",
      options: [],
    };
  }

  if (schedule?.step === "phone") {
    return {
      state: "coleta_telefone",
      step: "phone",
      description: "Coletando telefone de contato. Pode ser número ou 'é o mesmo número'.",
      options: [],
    };
  }

  if (schedule?.step === "name") {
    return {
      state: "coleta_nome",
      step: "name",
      description: "Coletando nome completo do cliente para agendamento.",
      options: [],
    };
  }

  if (memory.pendingPostQuoteChoiceByNumber?.has(number)) {
    return {
      state: "pos_orcamento",
      step: "post_quote_choice",
      description: "Cliente recebeu orçamento e deve escolher agendar ou tirar dúvida.",
      options: [
        { id: 1, label: "Agendar" },
        { id: 2, label: "Tirar dúvida" },
      ],
    };
  }

  if (memory.pendingHandoffPhotosByNumber?.has(number)) {
    return {
      state: "handoff_fotos",
      step: "handoff_photos",
      description: "Cliente enviando fotos da tattoo atual para reforma/complemento.",
      options: [],
    };
  }

  if (memory.pendingHandoffAreasByNumber?.has(number)) {
    return {
      state: "handoff_areas",
      step: "handoff_areas",
      description: "Cliente informando números das áreas do catálogo para reforma/complemento.",
      options: [],
    };
  }

  if (memory.pendingCatalogAreasByNumber?.has(number)) {
    return {
      state: "selecao_areas_catalogo",
      step: "catalog_areas",
      description: "Cliente informando números das áreas do catálogo para nova tattoo.",
      options: [],
    };
  }

  if (memory.hasPendingPoll?.(number)) {
    return {
      state: "menu_principal",
      step: "main_menu",
      description: "Menu inicial: tipo de projeto.",
      options: [
        { id: 1, label: "Nova Tattoo" },
        { id: 2, label: "Reformar" },
        { id: 3, label: "Complementar" },
      ],
    };
  }

  return null;
}

/**
 * @param {object | null} flowContext
 * @returns {string}
 */
export function getFlowReminderMessage(flowContext) {
  if (!flowContext) {
    return "Não entendi. Pode reformular sua mensagem?";
  }

  switch (flowContext.step) {
    case "post_quote_choice":
      return "Me diz como quer seguir:\n1 - Agendar 📅\n2 - Tirar dúvida 💬\n\nVocê também pode dizer *quero agendar* ou *tenho uma dúvida*.";
    case "main_menu":
      return "Escolha uma opção 👇\n1 - Nova Tattoo 🆕\n2 - Reformar ♻️\n3 - Complementar 🧩";
    case "catalog_areas":
      return "Me envie os números das áreas da imagem (ex: 1, 4 e 7) ✍️";
    case "handoff_areas":
      return "Me envie os números das áreas (ex: 2, 6 e 9) para eu encaminhar ao especialista.";
    case "handoff_photos":
      return "Envie fotos da tattoo atual ou diga *sem foto* se não tiver.";
    case "name":
      return "Qual seu nome completo para o agendamento?";
    case "phone":
      return 'Qual seu telefone para contato? Pode dizer "é o mesmo número" se for este WhatsApp.';
    case "slot_choice":
      return "Escolha um horário pelo número ou diga *sexta*, *semana que vem* ou *mais horários*.";
    case "faq":
      return "Pode mandar sua dúvida sobre tattoo tribal! Ou digite:\n1 - Agendar agora 📅\n2 - Fazer outra pergunta 💬";
    case "pix":
      return "Envie o comprovante PIX (imagem) do sinal para confirmar o horário.";
    default:
      return "Não entendi. Pode reformular?";
  }
}
