import {
  isAffirmative,
  isNegative,
} from "@/lib/conversation-intent";
import {
  matchLocalFaqAnswer,
  normalizeFaqEntries,
  DEFAULT_FAQ_ENTRIES,
} from "@/lib/faq-tattoo-tribal";
import { handleAiCoachTurn } from "@/lib/ai-flow-coach";
import { offerHumanChoice, isAwaitingHumanChoice, resetConfusion } from "@/lib/human-handoff";
import { createDefaultDb } from "@/lib/db-defaults";

jest.mock("@/lib/gemini", () => ({
  isGeminiConfigured: jest.fn(() => false),
  interpretInFlowMessage: jest.fn(async () => null),
  answerTattooFaq: jest.fn(async () => null),
  parseUserIntent: jest.fn(async () => null),
  parseFlowIntent: jest.fn(async () => null),
}));

describe("isAffirmative / isNegative", () => {
  it("reconhece equivalentes de sim", () => {
    expect(isAffirmative("claro")).toBe(true);
    expect(isAffirmative("lógico")).toBe(true);
    expect(isAffirmative("pode ser")).toBe(true);
    expect(isAffirmative("fechado")).toBe(true);
    expect(isAffirmative("beleza")).toBe(true);
    expect(isAffirmative("sim")).toBe(true);
  });

  it("reconhece equivalentes de não", () => {
    expect(isNegative("nah")).toBe(true);
    expect(isNegative("negativo")).toBe(true);
    expect(isNegative("não")).toBe(true);
    expect(isNegative("nao")).toBe(true);
  });

  it("rejeita texto ambíguo", () => {
    expect(isAffirmative("quero agendar amanhã")).toBe(false);
    expect(isNegative("talvez")).toBe(false);
  });
});

describe("faqEntries / matchLocalFaqAnswer", () => {
  it("seed DEFAULT_FAQ_ENTRIES tem ao menos 20 itens", () => {
    expect(DEFAULT_FAQ_ENTRIES.length).toBeGreaterThanOrEqual(20);
  });

  it("normalizeFaqEntries preenche seed quando vazio", () => {
    const normalized = normalizeFaqEntries([]);
    expect(normalized.length).toBe(DEFAULT_FAQ_ENTRIES.length);
  });

  it("match usa answer do DB customizado", () => {
    const custom = [
      {
        id: "dor",
        question: "Dói?",
        keywords: ["dor", "doer"],
        answer: "Resposta custom do painel.",
        aiContext: "",
        enabled: true,
      },
    ];
    expect(matchLocalFaqAnswer("vai doer muito?", custom)).toBe("Resposta custom do painel.");
  });

  it("ignora entradas disabled", () => {
    const custom = [
      {
        id: "dor",
        question: "Dói?",
        keywords: ["dor"],
        answer: "Não deve aparecer",
        enabled: false,
      },
    ];
    expect(matchLocalFaqAnswer("dor", custom)).toBeNull();
  });

  it("createDefaultDb inclui faqEntries", () => {
    const db = createDefaultDb();
    expect(Array.isArray(db.settings.faqEntries)).toBe(true);
    expect(db.settings.faqEntries.length).toBeGreaterThanOrEqual(20);
  });
});

describe("ai-flow-coach (sem OmniRoute)", () => {
  const number = "5511999887766";

  beforeEach(() => {
    resetConfusion(number, "");
  });

  it("mapeia claro para opção Agendar no pós-orçamento", async () => {
    const db = createDefaultDb();
    const result = await handleAiCoachTurn({
      db,
      number,
      text: "claro",
      flowContext: {
        state: "pos_orcamento",
        step: "post_quote_choice",
        options: [
          { id: 1, label: "Agendar" },
          { id: 2, label: "Tirar dúvida" },
        ],
      },
      instance: "",
    });
    expect(result.action).toBe("select_option");
    expect(result.optionId).toBe(1);
  });

  it("responde dúvida local e mantém guia do passo", async () => {
    const db = createDefaultDb();
    const result = await handleAiCoachTurn({
      db,
      number,
      text: "a tattoo dói?",
      flowContext: {
        state: "coleta_nome",
        step: "name",
        description: "Pedido de nome",
        options: [],
      },
      instance: "",
    });
    expect(result.action).toBe("answer");
    expect(result.message).toMatch(/nome/i);
  });

  it("oferece humano quando pergunta sem KB e IA off", async () => {
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
    expect(result.message).toMatch(/atendente/i);
    expect(isAwaitingHumanChoice(number, "")).toBe(true);
  });
});

describe("offerHumanChoice", () => {
  it("marca awaitingChoice", () => {
    const number = "5511888777666";
    resetConfusion(number, "inst");
    const msg = offerHumanChoice(number, "Sem resposta.", "inst");
    expect(msg).toMatch(/atendente/i);
    expect(isAwaitingHumanChoice(number, "inst")).toBe(true);
  });
});
