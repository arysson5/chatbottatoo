import { test, expect } from "@playwright/test";

/**
 * E2E das rotas Evolution: validação de entrada e contrato HTTP.
 * Geração de QR, parsing e polling são cobertos em __tests__/unit/evolution-qrcode.test.js
 * (não dependem de rede Docker/host).
 */
test.describe("Evolution API — cadastro de número com QR Code", () => {
  test("POST /api/evolution/create valida campos obrigatórios", async ({ request }) => {
    const response = await request.post("/api/evolution/create", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/obrigat/i);
  });

  test("POST /api/evolution/create monta webhookUrl quando host presente", async ({ request }) => {
    const response = await request.post("/api/evolution/create", {
      data: {
        instanceName: "briza-5511999887766",
        baseUrl: "http://127.0.0.1:9999",
        apiKey: "test-api-key-e2e",
      },
      headers: { "Content-Type": "application/json", Host: "127.0.0.1:3000" },
    });

    const body = await response.json();
    if (response.status() === 200) {
      expect(body._webhookUrl).toMatch(/\/api\/webhook$/);
    } else {
      expect(response.status()).toBe(502);
      expect(body.error).toMatch(/Evolution API/i);
    }
  });

  test("POST /api/evolution/connect valida instanceName obrigatório", async ({ request }) => {
    const response = await request.post("/api/evolution/connect", {
      data: { baseUrl: "http://127.0.0.1:9999", apiKey: "test-api-key-e2e" },
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
  });

  test("POST /api/evolution/connect retorna JSON estruturado ou erro de rede", async ({ request }) => {
    const response = await request.post("/api/evolution/connect", {
      data: {
        instanceName: "briza-5511999887766",
        baseUrl: "http://127.0.0.1:9999",
        apiKey: "test-api-key-e2e",
      },
      headers: { "Content-Type": "application/json" },
    });

    const body = await response.json();
    expect([200, 502]).toContain(response.status());

    if (response.status() === 200) {
      expect(body.qrcodeDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(body.pairingCode).toBeTruthy();
    } else {
      expect(body.error).toMatch(/Evolution API/i);
    }
  });

  test("POST /api/evolution/connection-state valida instanceName", async ({ request }) => {
    const response = await request.post("/api/evolution/connection-state", {
      data: { baseUrl: "http://127.0.0.1:9999", apiKey: "test-api-key-e2e" },
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status()).toBe(400);
  });
});
