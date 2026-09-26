import {
  detectNavigationIntent,
  buildNavigationConfirmMessage,
  proposeNavigation,
  resolveNavConfirmReply,
  clearPendingNavConfirm,
  applyFlowNavigation,
  STEP_CONFIRM_QUESTIONS,
  resolvePreviousStep,
} from "@/lib/flow-navigation";
import { handleAiCoachTurn } from "@/lib/ai-flow-coach";
import { createDefaultDb } from "@/lib/db-defaults";
import { resetConfusion } from "@/lib/human-handoff";

jest.mock("@/lib/gemini", () => ({
  isGeminiConfigured: jest.fn(() => false),
  interpretInFlowMessage: jest.fn(async () => null),
  answerTattooFaq: jest.fn(async () => null),
  parseUserIntent: jest.fn(async () => null),
  parseFlowIntent: jest.fn(async () => null),
}));

jest.mock("@/lib/flows/flow-store", () => {
  const schedules = new Map();
  return {
    getPendingSchedule: jest.fn((db, number, instance = "") => {
      const key = `${instance}:${number}`;
      return schedules.get(key) || null;
    }),
    upsertPendingSchedule: jest.fn(async (number, data, instance = "") => {
      const key = `${instance}:${number}`;
      schedules.set(key, { ...schedules.get(key), ...data, number, instance });
    }),
    getPendingPayment: jest.fn(() => null),
    __schedules: schedules,
  };
});

jest.mock("@/lib/flow-interaction-store", () => ({
  clearMenuFlow: jest.fn(async () => {}),
  persistMainMenu: jest.fn(async () => {}),
  persistCatalogAreas: jest.fn(async () => {}),
  persistPostQuote: jest.fn(async () => {}),
  persistHandoffAreas: jest.fn(async () => {}),
  persistHandoffPhotos: jest.fn(async () => {}),
}));

jest.mock("@/lib/simple-db", () => ({
  updateDb: jest.fn(async (fn) => fn({})),
  readDb: jest.fn(async () => ({})),
}));

describe("flow-navigation", () => {
  const number = "5511999000111";

  beforeEach(() => {
    clearPendingNavConfirm(number, "");
    resetConfusion(number, "");
    const store = require("@/lib/flows/flow-store");
    store.__schedules.clear();
  });

  it("detecta voltar do começo → main_menu", () => {
    const intent = detectNavigationIntent("Quero voltar do começo", {
      step: "faq",
    });
    expect(intent?.targetStep).toBe("main_menu");
  });

  it("confirmação usa linguagem do tipo de projeto", () => {
    const msg = buildNavigationConfirmMessage("main_menu");
    expect(msg).toMatch(/tipo de projeto/i);
    expect(msg).toMatch(/Nova Tattoo/i);
    expect(msg).not.toMatch(/main_menu/);
    expect(msg).toMatch(/1 - Sim/);
  });

  it("confirmação de áreas usa catálogo", () => {
    const msg = buildNavigationConfirmMessage("catalog_areas");
    expect(msg).toMatch(/catálogo de áreas/i);
    expect(msg).not.toMatch(/catalog_areas/);
  });

  it("não é esse número → phone", () => {
    expect(
      detectNavigationIntent("não é esse número", { step: "phone" })?.targetStep,
    ).toBe("phone");
  });

  it("errei o nome → name", () => {
    expect(detectNavigationIntent("errei o nome", { step: "phone" })?.targetStep).toBe(
      "name",
    );
  });

  it("errei genérico volta um passo", () => {
    expect(resolvePreviousStep("phone")).toBe("name");
    expect(detectNavigationIntent("errei", { step: "phone" })?.targetStep).toBe("name");
  });

  it("propose não muda step até o Sim", async () => {
    const proposed = proposeNavigation(number, "main_menu", "");
    expect(proposed.action).toBe("propose_navigate");
    expect(proposed.message).toMatch(/tipo de projeto/i);

    const store = require("@/lib/flows/flow-store");
    await store.upsertPendingSchedule(
      number,
      {
        step: "faq",
        selectedAreas: [1, 4],
        estimatedTotal: 1500,
      },
      "",
    );

    const yes = resolveNavConfirmReply("sim", number, "");
    expect(yes.action).toBe("navigate");
    expect(yes.targetStep).toBe("main_menu");

    const db = { pendingSchedules: [store.__schedules.get(`:${number}`)] };
    const maps = {
      pendingPollByNumber: new Map(),
      pendingCatalogAreasByNumber: new Map(),
      pendingCatalogAreaConfirmByNumber: new Map(),
      pendingPostQuoteChoiceByNumber: new Map(),
      pendingHandoffAreasByNumber: new Map(),
      pendingHandoffAreaConfirmByNumber: new Map(),
      pendingHandoffPhotosByNumber: new Map(),
    };
    const applied = await applyFlowNavigation({
      targetStep: "main_menu",
      number,
      instance: "",
      maps,
      db,
    });
    expect(applied.targetStep).toBe("main_menu");
    const after = store.__schedules.get(`:${number}`);
    expect(after.step).toBe("quoted");
    expect(after.selectedAreas).toEqual([1, 4]);
    expect(after.estimatedTotal).toBe(1500);
  });

  it("Não cancela e limpa pendência", () => {
    proposeNavigation(number, "phone", "");
    const no = resolveNavConfirmReply("não", number, "");
    expect(no.action).toBe("cancel_navigate");
    expect(resolveNavConfirmReply("sim", number, "").action).toBe("none");
  });
});

describe("coach propose_navigate + FAQ sem painel", () => {
  const number = "5511888000222";

  beforeEach(() => {
    clearPendingNavConfirm(number, "");
    resetConfusion(number, "");
  });

  it("quero voltar do começo → propose_navigate com tipo de projeto", async () => {
    const db = createDefaultDb();
    const result = await handleAiCoachTurn({
      db,
      number,
      text: "Quero voltar do começo",
      flowContext: {
        state: "faq_pos_orcamento",
        step: "faq",
        options: [
          { id: 1, label: "Agendar agora" },
          { id: 2, label: "Outra pergunta" },
        ],
      },
      instance: "",
    });
    expect(result.action).toBe("propose_navigate");
    expect(result.targetStep).toBe("main_menu");
    expect(result.message).toMatch(/tipo de projeto/i);
    expect(result.message).not.toMatch(/painel/i);
  });

  it("FAQ sem resposta não fala painel", async () => {
    const db = createDefaultDb();
    db.settings.faqEntries = [];
    const result = await handleAiCoachTurn({
      db,
      number,
      text: "vocês fazem piercing no nariz?",
      flowContext: {
        state: "faq_pos_orcamento",
        step: "faq",
        options: [
          { id: 1, label: "Agendar agora" },
          { id: 2, label: "Outra pergunta" },
        ],
      },
      instance: "",
    });
    expect(result.action).toBe("offer_human");
    expect(result.message).not.toMatch(/painel/i);
    expect(result.message).toMatch(/atendente/i);
  });

  it("STEP_CONFIRM_QUESTIONS cobre destinos do plano", () => {
    for (const key of [
      "main_menu",
      "catalog_areas",
      "name",
      "phone",
      "post_quote_choice",
      "faq",
    ]) {
      expect(STEP_CONFIRM_QUESTIONS[key]).toBeTruthy();
      expect(STEP_CONFIRM_QUESTIONS[key]).not.toMatch(key);
    }
  });
});
