import { test, expect } from "@playwright/test";
import {
  resetTestDb,
  readTestDb,
  buildWebhookPayload,
  MOCK_SLOTS,
} from "../__tests__/helpers/fixtures.js";

const TEST_NUMBER = "5511999887766";

test.describe("Memória de fluxo — retomada de contexto", () => {
  test.beforeEach(async () => {
    await resetTestDb({
      settings: {
        targetNumber: "5511988501368",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
        pixKey: "test@pix.com",
        pixFixedAmount: "R$ 200,00",
        pixHolderName: "Maria Brizza",
      },
      pendingInteractions: [
        {
          number: TEST_NUMBER,
          step: "main_menu",
          data: { createdAt: Date.now() },
          updatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
      pendingSchedules: [
        {
          number: TEST_NUMBER,
          step: "slot_choice",
          clientName: "João Teste",
          clientPhone: TEST_NUMBER,
          allSlots: MOCK_SLOTS,
          visibleSlots: MOCK_SLOTS.slice(0, 8),
          slotPage: 0,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  test("persiste pendingSchedule com step slot_choice", async () => {
    const db = await readTestDb();
    const schedule = db.pendingSchedules.find((s) => s.number === TEST_NUMBER);

    expect(schedule).toBeDefined();
    expect(schedule.step).toBe("slot_choice");
    expect(schedule.clientName).toBe("João Teste");
    expect(schedule.allSlots.length).toBeGreaterThan(0);
  });

  test("persiste pendingInteraction main_menu com TTL", async () => {
    const db = await readTestDb();
    const interaction = db.pendingInteractions.find(
      (i) => i.number === TEST_NUMBER && i.step === "main_menu",
    );

    expect(interaction).toBeDefined();
    expect(new Date(interaction.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  test("webhook processa escolha de horário sem erro", async ({ request }) => {
    const payload = buildWebhookPayload("1", { number: TEST_NUMBER });
    const response = await request.post("/api/webhook", {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);
  });

  test("webhook processa mensagem confusa durante agendamento", async ({ request }) => {
    const payload = buildWebhookPayload("não entendi nada", { number: TEST_NUMBER });
    const response = await request.post("/api/webhook", {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);

    const db = await readTestDb();
    const schedule = db.pendingSchedules.find((s) => s.number === TEST_NUMBER);
    expect(schedule?.step).toBe("slot_choice");
  });

  test("pendingPayment indica fluxo PIX ativo", async () => {
    await resetTestDb({
      pendingPayments: [
        {
          number: TEST_NUMBER,
          step: "pix",
          amount: 200,
          slot: MOCK_SLOTS[0],
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const db = await readTestDb();
    const payment = db.pendingPayments.find((p) => p.number === TEST_NUMBER);

    expect(payment).toBeDefined();
    expect(payment.step).toBe("pix");
    expect(payment.amount).toBe(200);
  });
});
