import { detectFlowContext, getFlowReminderMessage } from "@/lib/flow-context";

const TEST_NUMBER = "5511999887766";

function createMemory(overrides = {}) {
  return {
    pendingPostQuoteChoiceByNumber: new Map(),
    pendingCatalogAreasByNumber: new Map(),
    pendingHandoffAreasByNumber: new Map(),
    pendingHandoffPhotosByNumber: new Map(),
    pendingPollByNumber: new Map(),
    hasPendingPoll: (n) => overrides.pendingPollByNumber?.has(n) ?? false,
    ...overrides,
  };
}

describe("flow-context", () => {
  describe("detectFlowContext", () => {
    it("detecta estado pix_comprovante quando há pendingPayment", () => {
      const db = {
        pendingPayments: [{ number: TEST_NUMBER, step: "pix", amount: 200 }],
        pendingSchedules: [],
      };
      const ctx = detectFlowContext(db, TEST_NUMBER, createMemory());

      expect(ctx.state).toBe("pix_comprovante");
      expect(ctx.step).toBe("pix");
    });

    it("detecta escolha_horario no step slot_choice", () => {
      const db = {
        pendingSchedules: [{ number: TEST_NUMBER, step: "slot_choice", allSlots: [] }],
        pendingPayments: [],
      };
      const ctx = detectFlowContext(db, TEST_NUMBER, createMemory());

      expect(ctx.state).toBe("escolha_horario");
      expect(ctx.step).toBe("slot_choice");
    });

    it("detecta coleta_nome e coleta_telefone", () => {
      const nameDb = {
        pendingSchedules: [{ number: TEST_NUMBER, step: "name" }],
        pendingPayments: [],
      };
      const phoneDb = {
        pendingSchedules: [{ number: TEST_NUMBER, step: "phone" }],
        pendingPayments: [],
      };

      expect(detectFlowContext(nameDb, TEST_NUMBER, createMemory()).state).toBe("coleta_nome");
      expect(detectFlowContext(phoneDb, TEST_NUMBER, createMemory()).state).toBe("coleta_telefone");
    });

    it("detecta pos_orcamento na memória", () => {
      const memory = createMemory();
      memory.pendingPostQuoteChoiceByNumber.set(TEST_NUMBER, { quote: 1000 });

      const ctx = detectFlowContext({ pendingSchedules: [], pendingPayments: [] }, TEST_NUMBER, memory);

      expect(ctx.state).toBe("pos_orcamento");
      expect(ctx.options).toHaveLength(2);
    });

    it("detecta menu_principal quando há poll pendente", () => {
      const pollMap = new Map([[TEST_NUMBER, Date.now()]]);
      const memory = createMemory({
        pendingPollByNumber: pollMap,
        hasPendingPoll: (n) => pollMap.has(n),
      });

      const ctx = detectFlowContext({ pendingSchedules: [], pendingPayments: [] }, TEST_NUMBER, memory);

      expect(ctx.state).toBe("menu_principal");
      expect(ctx.options).toHaveLength(3);
    });

    it("detecta selecao_areas_catalogo", () => {
      const memory = createMemory();
      memory.pendingCatalogAreasByNumber.set(TEST_NUMBER, Date.now());

      const ctx = detectFlowContext({ pendingSchedules: [], pendingPayments: [] }, TEST_NUMBER, memory);

      expect(ctx.state).toBe("selecao_areas_catalogo");
    });

    it("retorna null quando não há fluxo ativo", () => {
      const ctx = detectFlowContext({ pendingSchedules: [], pendingPayments: [] }, TEST_NUMBER, createMemory());

      expect(ctx).toBeNull();
    });
  });

  describe("getFlowReminderMessage", () => {
    it("retorna lembrete específico para cada step", () => {
      expect(getFlowReminderMessage({ step: "post_quote_choice" })).toMatch(/Agendar/i);
      expect(getFlowReminderMessage({ step: "main_menu" })).toMatch(/Nova Tattoo/i);
      expect(getFlowReminderMessage({ step: "catalog_areas" })).toMatch(/números das áreas/i);
      expect(getFlowReminderMessage({ step: "slot_choice" })).toMatch(/horário/i);
      expect(getFlowReminderMessage({ step: "pix" })).toMatch(/comprovante PIX/i);
      expect(getFlowReminderMessage({ step: "name" })).toMatch(/nome completo/i);
      expect(getFlowReminderMessage({ step: "phone" })).toMatch(/telefone/i);
    });

    it("retorna mensagem genérica quando contexto é null", () => {
      expect(getFlowReminderMessage(null)).toMatch(/Não entendi/i);
    });
  });
});
