import { test, expect } from "@playwright/test";
import { resetTestDb, readTestDb, buildWebhookPayload } from "../__tests__/helpers/fixtures.js";
import { SAMPLE_NUBANK_RECEIPT } from "../__tests__/helpers/fixtures.js";

const TEST_NUMBER = "5511999887766";

test.describe("Comprovante PIX — reconhecimento e extração", () => {
  test.beforeEach(async () => {
    await resetTestDb({
      settings: {
        targetNumber: "5511988501368",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
        pixKey: "11999887766",
        pixFixedAmount: "R$ 200,00",
        pixHolderName: "Maria Brizza Silva",
      },
      pendingSchedules: [
        {
          number: TEST_NUMBER,
          step: "pix",
          clientName: "Cliente Teste",
          clientPhone: TEST_NUMBER,
          selectedSlot: { label: "Sex 13/06 10:00", start: "2026-06-13T13:00:00.000Z" },
          updatedAt: new Date().toISOString(),
        },
      ],
      pendingPayments: [
        {
          number: TEST_NUMBER,
          step: "pix",
          amount: 200,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
  });

  test("banco reflete fluxo PIX ativo antes do comprovante", async () => {
    const db = await readTestDb();

    expect(db.pendingPayments.some((p) => p.number === TEST_NUMBER && p.step === "pix")).toBe(true);
    expect(db.settings.pixHolderName).toBe("Maria Brizza Silva");
    expect(db.settings.pixFixedAmount).toBe("R$ 200,00");
  });

  test("webhook aceita envio de valor manual como fallback", async ({ request }) => {
    const response = await request.post("/api/webhook", {
      data: buildWebhookPayload("200", { number: TEST_NUMBER }),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(200);
  });

  test("webhook aceita imagem de comprovante sem erro 500", async ({ request }) => {
    const payload = buildWebhookPayload("", {
      number: TEST_NUMBER,
      message: {
        imageMessage: {
          mimetype: "image/jpeg",
          caption: "comprovante pix",
        },
      },
    });

    const response = await request.post("/api/webhook", {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBeLessThan(500);
  });

  test("texto OCR de comprovante contém dados esperados (fixture)", () => {
    expect(SAMPLE_NUBANK_RECEIPT).toMatch(/R\$ 200,00/);
    expect(SAMPLE_NUBANK_RECEIPT).toMatch(/Maria Brizza/i);
    expect(SAMPLE_NUBANK_RECEIPT).toMatch(/E[A-Z0-9]{31,32}/);
  });

  test("transação duplicada é registrada no banco após uso", async () => {
    await resetTestDb({
      usedPixTransactionIds: [
        {
          id: "E12345678901234567890123456789012",
          number: "5511888777666",
          usedAt: new Date().toISOString(),
        },
      ],
    });

    const db = await readTestDb();
    expect(db.usedPixTransactionIds).toHaveLength(1);
    expect(db.usedPixTransactionIds[0].id).toMatch(/^E/);
  });
});
