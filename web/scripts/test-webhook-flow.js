/**
 * Testa fluxo webhook: boas-vindas → menu → opção 1 → catálogo.
 * Uso: node scripts/test-webhook-flow.js
 */
const TEST_NUMBER = process.env.TEST_TARGET_NUMBER?.trim();
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() || "http://127.0.0.1:3000/api/webhook";
const INSTANCE = process.env.TEST_INSTANCE?.trim() || "briza-5511988501368";
const API_KEY = process.env.EVOLUTION_GLOBAL_API_KEY?.trim() || "";

function buildPayload(text, messageId) {
  return {
    event: "messages.upsert",
    instance: INSTANCE,
    server_url: "http://evolution-api:8080",
    apikey: API_KEY,
    data: {
      key: {
        remoteJid: `${TEST_NUMBER}@s.whatsapp.net`,
        fromMe: false,
        id: messageId,
      },
      pushName: "Teste Fluxo",
      message: { conversation: text },
    },
  };
}

async function postWebhook(text, step) {
  const started = Date.now();
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(text, `test-${step}-${Date.now()}`)),
  });
  const elapsed = Date.now() - started;
  console.log(`[${step}] "${text}" → HTTP ${res.status} (${elapsed}ms)`);
  return res.ok;
}

async function sendDirect(text) {
  const base = process.env.EVOLUTION_BASE_URL?.trim() || "http://evolution-api:8080";
  if (!API_KEY) return false;
  const res = await fetch(
    `${base.replace(/\/+$/, "")}/message/sendText/${encodeURIComponent(INSTANCE)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: API_KEY },
      body: JSON.stringify({ number: TEST_NUMBER, text }),
    },
  );
  console.log(`[evolution] sendText status ${res.status}`);
  return res.ok;
}

async function main() {
  if (!TEST_NUMBER) {
    console.error("Defina TEST_TARGET_NUMBER (ex.: 5511999999999) para o script de smoke test.");
    process.exit(1);
  }
  console.log("=== Teste de fluxo Briza Tattoo ===");
  console.log("Número:", TEST_NUMBER);
  console.log("Webhook:", WEBHOOK_URL);

  const steps = [
    ["oi", "welcome"],
    ["1", "menu_option_1"],
  ];

  for (const [text, label] of steps) {
    const ok = await postWebhook(text, label);
    if (!ok) {
      console.error("Falha no passo:", label);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (API_KEY) {
    await sendDirect("✅ Teste automático concluído — fluxo webhook OK.");
  }

  console.log("=== Fluxo concluído com sucesso ===");
}

main().catch((error) => {
  console.error("Erro:", error?.message || error);
  process.exit(1);
});
