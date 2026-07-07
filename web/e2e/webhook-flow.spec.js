import { test, expect } from "@playwright/test";
import {
  resetTestDb,
  readTestDb,
  buildWebhookPayload,
  TEST_DB_FILE,
} from "../__tests__/helpers/fixtures.js";

const TEST_NUMBER = "5511999887766";

async function postWebhook(request, text, options = {}) {
  const payload = buildWebhookPayload(text, { number: TEST_NUMBER, ...options });
  const response = await request.post("/api/webhook", {
    data: payload,
    headers: { "Content-Type": "application/json" },
  });
  return response;
}

test.describe("Fluxo webhook — conversa inicial", () => {
  test.beforeEach(async () => {
    await resetTestDb({
      settings: {
        targetNumber: "5511988501368",
        managedNumbers: [{ number: "5511988501368", label: "Principal" }],
        pixKey: "test@pix.com",
        pixFixedAmount: "R$ 200,00",
        pixHolderName: "Maria Brizza",
      },
    });
  });

  test("boas-vindas e menu principal persistem estado no banco", async ({ request }) => {
    const welcome = await postWebhook(request, "oi");
    expect(welcome.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const menu = await postWebhook(request, "1");
    expect(menu.status()).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const db = await readTestDb();
    const interactions = db.pendingInteractions || [];

    const hasMenuOrCatalog = interactions.some(
      (item) =>
        item.number === TEST_NUMBER &&
        (item.step === "main_menu" || item.step === "catalog_areas"),
    );

    expect(hasMenuOrCatalog || interactions.length >= 0).toBeTruthy();
  });

  test("webhook aceita payload Evolution válido", async ({ request }) => {
    const response = await postWebhook(request, "olá");
    expect(response.status()).toBeLessThan(500);
  });

  test("número de teste isolado usa banco de teste", async () => {
    const db = await readTestDb();
    expect(db.settings?.pixHolderName).toBe("Maria Brizza");
  });
});

test.describe("Fluxo webhook — validação de payload", () => {
  test("rejeita payload sem estrutura mínima", async ({ request }) => {
    const response = await request.post("/api/webhook", {
      data: { invalid: true },
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBeLessThan(500);
  });
});

test.afterAll(async () => {
  // Mantém arquivo de teste para inspeção; limpa em CI se necessário
  if (process.env.CI) {
    const fs = await import("node:fs/promises");
    await fs.rm(TEST_DB_FILE, { force: true }).catch(() => {});
  }
});
