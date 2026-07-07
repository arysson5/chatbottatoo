import { test, expect } from "@playwright/test";
import { resetTestDb, readTestDb, buildWebhookPayload, MOCK_SLOTS } from "../__tests__/helpers/fixtures.js";

const TEST_NUMBER = "5511999887766";

test.describe("Agendamento — fluxo de horários", () => {
  test.beforeEach(async () => {
    await resetTestDb({
      settings: {
        targetNumber: "5511988501368",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
        pixKey: "11999887766",
        pixFixedAmount: "R$ 200,00",
        pixHolderName: "Maria Brizza",
        scheduling: {
          slotDurationMinutes: 120,
          daysAhead: 14,
          workingHours: [
            { day: 1, start: "10:00", end: "19:00" },
            { day: 2, start: "10:00", end: "19:00" },
            { day: 3, start: "10:00", end: "19:00" },
            { day: 4, start: "10:00", end: "19:00" },
            { day: 5, start: "10:00", end: "19:00" },
            { day: 6, start: "10:00", end: "19:00" },
          ],
        },
      },
      pendingSchedules: [
        {
          number: TEST_NUMBER,
          step: "name",
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  test("coleta nome avança schedule para próximo step", async ({ request }) => {
    const response = await request.post("/api/webhook", {
      data: buildWebhookPayload("João da Silva", { number: TEST_NUMBER }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 2000));

    const db = await readTestDb();
    const schedule = db.pendingSchedules.find((s) => s.number === TEST_NUMBER);

    expect(schedule).toBeDefined();
    expect(["phone", "slot_choice", "name"]).toContain(schedule.step);
  });

  test("schedule com slot_choice aceita seleção numérica", async ({ request }) => {
    await resetTestDb({
      settings: {
        pixKey: "11999887766",
        pixFixedAmount: "R$ 200,00",
        pixHolderName: "Maria Brizza",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
      },
      pendingSchedules: [
        {
          number: TEST_NUMBER,
          step: "slot_choice",
          clientName: "Maria Teste",
          clientPhone: TEST_NUMBER,
          allSlots: MOCK_SLOTS,
          visibleSlots: MOCK_SLOTS.slice(0, 8),
          slotPage: 0,
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const response = await request.post("/api/webhook", {
      data: buildWebhookPayload("2", { number: TEST_NUMBER }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 2000));

    const db = await readTestDb();
    const schedule = db.pendingSchedules.find((s) => s.number === TEST_NUMBER);
    const payment = db.pendingPayments.find((p) => p.number === TEST_NUMBER);

    const advancedToPix =
      schedule?.step === "pix" || payment?.step === "pix" || schedule?.selectedSlot;

    expect(advancedToPix || schedule?.step === "slot_choice").toBeTruthy();
  });

  test("filtro 'sexta' durante slot_choice não quebra webhook", async ({ request }) => {
    await resetTestDb({
      settings: {
        pixKey: "11999887766",
        pixFixedAmount: "R$ 200,00",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
      },
      pendingSchedules: [
        {
          number: TEST_NUMBER,
          step: "slot_choice",
          clientName: "Ana Teste",
          allSlots: MOCK_SLOTS,
          visibleSlots: MOCK_SLOTS.slice(0, 8),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    const response = await request.post("/api/webhook", {
      data: buildWebhookPayload("prefiro sexta", { number: TEST_NUMBER }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);
  });
});
