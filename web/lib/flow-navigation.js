import { makeScopeKey } from "@/lib/scope-key";
import { normalizeIntentText, isAffirmative, isNegative } from "@/lib/conversation-intent";
import { getFlowReminderMessage } from "@/lib/flow-context";
import {
  getPendingSchedule,
  upsertPendingSchedule,
} from "@/lib/flows/flow-store";
import {
  clearMenuFlow,
  persistMainMenu,
  persistCatalogAreas,
  persistPostQuote,
  persistHandoffAreas,
  persistHandoffPhotos,
} from "@/lib/flow-interaction-store";
import { resetConfusion } from "@/lib/human-handoff";
import { FAQ_MENU_TEXT } from "@/lib/faq-tattoo-tribal";

/** Confirmação pendente: usuário ainda não disse Sim/Não. */
/** @type {Map<string, { targetStep: string, proposedAt: number }>} */
const pendingNavConfirmByScope = new Map();

const NAV_CONFIRM_TTL_MS = 30 * 60_000;

/** Perguntas em linguagem do fluxo real (nunca IDs técnicos). */
export const STEP_CONFIRM_QUESTIONS = {
  main_menu:
    "Quer voltar a escolher o *tipo de projeto*? Aí você escolhe *1 - Nova Tattoo*, *2 - Reformar* ou *3 - Complementar*. Seu orçamento fica guardado.",
  catalog_areas:
    "Quer voltar ao *catálogo de áreas*? (onde você manda os números da imagem, ex.: 1, 4 e 7)",
  catalog_areas_confirm:
    "Quer voltar a *confirmar as áreas* do catálogo?",
  post_quote_choice:
    "Quer voltar à escolha de *Agendar* ou *Tirar dúvida*?",
  faq: "Quer voltar às *dúvidas* sobre a tattoo?",
  name: "Quer voltar a informar o *nome completo*?",
  phone: "Quer voltar a informar o *telefone* de contato?",
  slot_choice: "Quer voltar a escolher o *horário*?",
  pix: "Quer voltar ao envio do *comprovante PIX*?",
  handoff_areas:
    "Quer voltar a escolher as *áreas* para o especialista? (números da imagem)",
  handoff_areas_confirm: "Quer voltar a *confirmar as áreas* para o especialista?",
  handoff_photos: "Quer voltar ao envio das *fotos* da tattoo?",
};

/** Cadeia: passo → anterior (ramo nova tattoo / agendar). */
const PREV_CATALOG = {
  pix: "slot_choice",
  slot_choice: "phone",
  phone: "name",
  name: "post_quote_choice",
  faq: "post_quote_choice",
  post_quote_choice: "catalog_areas",
  catalog_areas_confirm: "catalog_areas",
  catalog_areas: "main_menu",
  main_menu: "main_menu",
};

/** Cadeia ramo reformar/complementar. */
const PREV_HANDOFF = {
  handoff_photos: "handoff_areas",
  handoff_areas_confirm: "handoff_areas",
  handoff_areas: "main_menu",
  main_menu: "main_menu",
};

/**
 * @param {string} targetStep
 * @returns {string}
 */
export function buildNavigationConfirmMessage(targetStep) {
  const question =
    STEP_CONFIRM_QUESTIONS[targetStep] ||
    "Quer voltar *um passo* no atendimento?";
  return `${question}\n\n1 - Sim\n2 - Não`;
}

/**
 * @param {string} number
 * @param {string} [instance]
 * @returns {{ targetStep: string, proposedAt: number } | null}
 */
export function getPendingNavConfirm(number, instance = "") {
  const key = makeScopeKey(instance, number);
  const pending = pendingNavConfirmByScope.get(key);
  if (!pending) return null;
  if (Date.now() - pending.proposedAt > NAV_CONFIRM_TTL_MS) {
    pendingNavConfirmByScope.delete(key);
    return null;
  }
  return pending;
}

/**
 * @param {string} number
 * @param {string} targetStep
 * @param {string} [instance]
 */
export function setPendingNavConfirm(number, targetStep, instance = "") {
  pendingNavConfirmByScope.set(makeScopeKey(instance, number), {
    targetStep,
    proposedAt: Date.now(),
  });
}

/**
 * @param {string} number
 * @param {string} [instance]
 */
export function clearPendingNavConfirm(number, instance = "") {
  pendingNavConfirmByScope.delete(makeScopeKey(instance, number));
}

/**
 * @param {string} currentStep
 * @param {object | null} flowContext
 * @returns {string}
 */
export function resolvePreviousStep(currentStep, flowContext = null) {
  const step = String(currentStep || flowContext?.step || "");
  if (PREV_HANDOFF[step]) return PREV_HANDOFF[step];
  if (PREV_CATALOG[step]) return PREV_CATALOG[step];
  if (String(flowContext?.state || "").includes("handoff")) {
    return PREV_HANDOFF[step] || "main_menu";
  }
  return PREV_CATALOG[step] || "main_menu";
}

/**
 * Detecta intenção de navegação/correção (local, alta confiança).
 * @param {string} text
 * @param {object | null} flowContext
 * @returns {{ targetStep: string, confidence: number } | null}
 */
export function detectNavigationIntent(text, flowContext = null) {
  const n = normalizeIntentText(text);
  if (!n) return null;

  const currentStep = String(flowContext?.step || "");
  const inHandoff =
    currentStep.startsWith("handoff") ||
    String(flowContext?.state || "").includes("handoff");

  if (
    /\b(voltar (do |ao )?comeco|voltar (do |ao )?inicio|comecar de novo|comeco de novo|menu inicial|do zero|reiniciar|voltar pro comeco|voltar para o comeco)\b/.test(
      n,
    ) ||
    /^(comeco|inicio)$/.test(n)
  ) {
    return { targetStep: "main_menu", confidence: 0.95 };
  }

  if (
    /\b(nao e esse (numero|telefone)|numero errado|telefone errado|errei (o )?telefone|errei (o )?numero)\b/.test(
      n,
    )
  ) {
    return { targetStep: "phone", confidence: 0.92 };
  }

  if (/\b(errei (o )?nome|nome errado)\b/.test(n)) {
    return { targetStep: "name", confidence: 0.92 };
  }

  if (
    /\b(errei (a |as )?areas?|areas? errad|voltar.*(area|catalogo)|catalogo de areas)\b/.test(
      n,
    )
  ) {
    return {
      targetStep: inHandoff ? "handoff_areas" : "catalog_areas",
      confidence: 0.9,
    };
  }

  if (/\b(errei (o )?horario|horario errado|trocar horario)\b/.test(n)) {
    return { targetStep: "slot_choice", confidence: 0.9 };
  }

  if (/\b(nao quero)\b/.test(n) && !/\b(nao quero agendar)\b/.test(n)) {
    const prev = resolvePreviousStep(currentStep, flowContext);
    return { targetStep: prev, confidence: 0.75 };
  }

  if (
    /^(errei|voltei atras|voltar|volta)$/.test(n) ||
    /\b(quero voltar|voltar um passo|voltei atras)\b/.test(n)
  ) {
    const prev = resolvePreviousStep(currentStep, flowContext);
    return { targetStep: prev, confidence: 0.85 };
  }

  return null;
}

/**
 * Resolve Sim/Não de uma confirmação de navegação pendente.
 * @param {string} text
 * @param {string} number
 * @param {string} [instance]
 * @returns {{ action: 'navigate'|'cancel_navigate'|'none', targetStep?: string, message?: string }}
 */
export function resolveNavConfirmReply(text, number, instance = "") {
  const pending = getPendingNavConfirm(number, instance);
  if (!pending) return { action: "none" };

  if (isAffirmative(text) || /^1\b/.test(String(text || "").trim())) {
    clearPendingNavConfirm(number, instance);
    return { action: "navigate", targetStep: pending.targetStep };
  }
  if (isNegative(text) || /^2\b/.test(String(text || "").trim())) {
    clearPendingNavConfirm(number, instance);
    return {
      action: "cancel_navigate",
      message: "Beleza, seguimos de onde paramos.",
    };
  }
  // Ainda aguardando resposta clara
  return {
    action: "none",
    message: buildNavigationConfirmMessage(pending.targetStep),
  };
}

/**
 * Aplica navegação após Sim: ajusta estado e devolve prompt do destino.
 * Preserva orçamento (selectedAreas / estimatedTotal / datas).
 * @param {object} params
 * @returns {Promise<{
 *   targetStep: string,
 *   message: string,
 *   needsCatalog?: boolean,
 *   quoteContext?: object,
 * }>}
 */
export async function applyFlowNavigation(params) {
  const {
    targetStep,
    number,
    instance = "",
    maps,
    db,
    catalogPrompt = "Agora me envie os números das áreas da imagem que você quer tatuar (ex: 1, 4 e 7) 📍",
  } = params;

  const schedule = getPendingSchedule(db, number, instance);
  const quoteContext = {
    selectedAreas: Array.isArray(schedule?.selectedAreas) ? schedule.selectedAreas : [],
    estimatedTotal:
      typeof schedule?.estimatedTotal === "number" ? schedule.estimatedTotal : 0,
    quoteIssuedAt: schedule?.quoteIssuedAt || null,
    quoteExpiresAt: schedule?.quoteExpiresAt || null,
    instance: schedule?.instance || instance || "",
    clientName: schedule?.clientName || schedule?.fullName || "",
    fullName: schedule?.fullName || schedule?.clientName || "",
    clientPhone: schedule?.clientPhone || "",
  };

  clearPendingNavConfirm(number, instance);
  resetConfusion(number, instance);

  if (maps) {
    await clearMenuFlow(number, maps, instance);
  }

  const preserveQuote = async (nextStep) => {
    await upsertPendingSchedule(
      number,
      {
        ...(schedule || {}),
        ...quoteContext,
        step: nextStep,
        number,
        instance: quoteContext.instance || instance,
      },
      instance,
    );
  };

  switch (targetStep) {
    case "main_menu": {
      if (schedule || quoteContext.selectedAreas.length || quoteContext.estimatedTotal) {
        await preserveQuote("quoted");
      }
      if (maps) {
        await persistMainMenu(number, maps, instance);
      }
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "main_menu" }),
        quoteContext,
      };
    }
    case "catalog_areas": {
      await preserveQuote("quoted");
      if (maps) {
        await persistCatalogAreas(number, maps, instance);
      }
      return {
        targetStep,
        message: catalogPrompt,
        needsCatalog: true,
        quoteContext,
      };
    }
    case "catalog_areas_confirm": {
      await preserveQuote("quoted");
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "catalog_areas_confirm" }),
        quoteContext,
      };
    }
    case "post_quote_choice": {
      await preserveQuote("quoted");
      if (maps) {
        await persistPostQuote(
          number,
          {
            selectedAreas: quoteContext.selectedAreas,
            estimatedTotal: quoteContext.estimatedTotal,
            quoteIssuedAt: quoteContext.quoteIssuedAt,
            quoteExpiresAt: quoteContext.quoteExpiresAt,
            instance: quoteContext.instance,
          },
          maps,
          instance,
        );
      }
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "post_quote_choice" }),
        quoteContext,
      };
    }
    case "faq": {
      await preserveQuote("faq");
      return {
        targetStep,
        message: FAQ_MENU_TEXT,
        quoteContext,
      };
    }
    case "name": {
      await preserveQuote("name");
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "name" }),
        quoteContext,
      };
    }
    case "phone": {
      await preserveQuote("phone");
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "phone" }),
        quoteContext,
      };
    }
    case "slot_choice": {
      await preserveQuote("slot_choice");
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "slot_choice" }),
        quoteContext,
      };
    }
    case "pix": {
      await preserveQuote("pix");
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "pix" }),
        quoteContext,
      };
    }
    case "handoff_areas": {
      await preserveQuote("quoted");
      if (maps) {
        await persistHandoffAreas(
          number,
          { projectType: schedule?.projectType || "reformar", createdAt: Date.now() },
          maps,
          instance,
        );
      }
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "handoff_areas" }),
        quoteContext,
      };
    }
    case "handoff_areas_confirm": {
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "handoff_areas_confirm" }),
        quoteContext,
      };
    }
    case "handoff_photos": {
      await preserveQuote("quoted");
      if (maps) {
        await persistHandoffPhotos(
          number,
          {
            projectType: schedule?.projectType || "reformar",
            selectedAreas: quoteContext.selectedAreas,
            estimatedTotal: quoteContext.estimatedTotal,
            createdAt: Date.now(),
          },
          maps,
          instance,
        );
      }
      return {
        targetStep,
        message: getFlowReminderMessage({ step: "handoff_photos" }),
        quoteContext,
      };
    }
    default: {
      if (maps) {
        await persistMainMenu(number, maps, instance);
      }
      return {
        targetStep: "main_menu",
        message: getFlowReminderMessage({ step: "main_menu" }),
        quoteContext,
      };
    }
  }
}

/**
 * Propõe navegação (grava pendência + mensagem de confirmação).
 * @param {string} number
 * @param {string} targetStep
 * @param {string} [instance]
 */
export function proposeNavigation(number, targetStep, instance = "") {
  const safeStep = STEP_CONFIRM_QUESTIONS[targetStep] ? targetStep : "main_menu";
  setPendingNavConfirm(number, safeStep, instance);
  return {
    action: "propose_navigate",
    targetStep: safeStep,
    message: buildNavigationConfirmMessage(safeStep),
  };
}
