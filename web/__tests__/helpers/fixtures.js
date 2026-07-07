import fs from "node:fs/promises";
import path from "node:path";
import { createDefaultDb } from "@/lib/db-defaults";

export const TEST_DB_FILE = path.join(process.cwd(), "__tests__", "data", "app-db.test.json");

export async function resetTestDb(overrides = {}) {
  const db = { ...createDefaultDb(), ...overrides };
  await fs.mkdir(path.dirname(TEST_DB_FILE), { recursive: true });
  await fs.writeFile(TEST_DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  return db;
}

export async function readTestDb() {
  const raw = await fs.readFile(TEST_DB_FILE, "utf-8");
  return JSON.parse(raw);
}

export function buildWebhookPayload(text, options = {}) {
  const {
    number = "5511999887766",
    instance = "briza-5511988501368",
    messageId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message = { conversation: text },
  } = options;

  return {
    event: "messages.upsert",
    instance,
    server_url: "http://evolution-api:8080",
    apikey: "test-api-key-e2e",
    data: {
      key: {
        remoteJid: `${number}@s.whatsapp.net`,
        fromMe: false,
        id: messageId,
      },
      pushName: "Cliente Teste E2E",
      message,
    },
  };
}

export function buildImageProofPayload(number, base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==") {
  return buildWebhookPayload("", {
    number,
    message: {
      imageMessage: {
        mimetype: "image/jpeg",
        caption: "comprovante pix",
        jpegThumbnail: base64,
      },
    },
  });
}

export const SAMPLE_NUBANK_RECEIPT = `
Comprovante de transferência PIX
Transferência enviada
Para: Maria Brizza Silva
Valor: R$ 200,00
ID da transação: E12345678901234567890123456789012
Pix realizado com sucesso
Nubank
`.trim();

export const SAMPLE_ITAU_RECEIPT = `
Comprovante Pix
Pagamento enviado
Favorecido: Matheus Brizza
R$ 150,50
Autenticação: ABC123456789
Transferência via PIX
Itaú
`.trim();

export const MOCK_SLOTS = [
  { id: 1, label: "Qua 10/06 10:00", start: "2026-06-10T13:00:00.000Z", end: "2026-06-10T15:00:00.000Z" },
  { id: 2, label: "Qui 11/06 14:00", start: "2026-06-11T17:00:00.000Z", end: "2026-06-11T19:00:00.000Z" },
  { id: 3, label: "Sex 12/06 10:00", start: "2026-06-12T13:00:00.000Z", end: "2026-06-12T15:00:00.000Z" },
  { id: 4, label: "Sex 12/06 14:00", start: "2026-06-12T17:00:00.000Z", end: "2026-06-12T19:00:00.000Z" },
  { id: 5, label: "Seg 15/06 10:00", start: "2026-06-15T13:00:00.000Z", end: "2026-06-15T15:00:00.000Z" },
  { id: 6, label: "Ter 16/06 14:00", start: "2026-06-16T17:00:00.000Z", end: "2026-06-16T19:00:00.000Z" },
  { id: 7, label: "Qua 17/06 10:00", start: "2026-06-17T13:00:00.000Z", end: "2026-06-17T15:00:00.000Z" },
  { id: 8, label: "Qui 18/06 14:00", start: "2026-06-18T17:00:00.000Z", end: "2026-06-18T19:00:00.000Z" },
  { id: 9, label: "Sex 19/06 10:00", start: "2026-06-19T13:00:00.000Z", end: "2026-06-19T15:00:00.000Z" },
];
