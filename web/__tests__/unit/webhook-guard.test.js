import {
  MESSAGE_MAX_AGE_MS,
  _resetWebhookGuardForTests,
  extractMessageId,
  extractMessageTimestampMs,
  filterInboundEntries,
  isMessageTooOld,
  markMessageSeen,
  markWelcomeSent,
  shouldSendWelcome,
  wasMessageSeen,
} from "@/lib/webhook-guard";

describe("webhook-guard", () => {
  beforeEach(() => {
    _resetWebhookGuardForTests();
  });

  describe("extractMessageTimestampMs", () => {
    it("converte timestamp em segundos", () => {
      expect(extractMessageTimestampMs({ messageTimestamp: 1_700_000_000 })).toBe(1_700_000_000_000);
    });

    it("mantém timestamp em milissegundos", () => {
      expect(extractMessageTimestampMs({ messageTimestamp: 1_700_000_000_000 })).toBe(1_700_000_000_000);
    });
  });

  describe("isMessageTooOld", () => {
    it("ignora mensagem antiga", () => {
      const now = Date.now();
      expect(isMessageTooOld(now - MESSAGE_MAX_AGE_MS - 1000, now)).toBe(true);
    });

    it("aceita mensagem recente", () => {
      const now = Date.now();
      expect(isMessageTooOld(now - 60_000, now)).toBe(false);
    });

    it("não rejeita quando timestamp ausente", () => {
      expect(isMessageTooOld(0)).toBe(false);
    });
  });

  describe("dedupe", () => {
    it("marca e detecta messageId visto", () => {
      expect(wasMessageSeen("briza-1", "abc")).toBe(false);
      markMessageSeen("briza-1", "abc");
      expect(wasMessageSeen("briza-1", "abc")).toBe(true);
      expect(wasMessageSeen("briza-2", "abc")).toBe(false);
    });
  });

  describe("filterInboundEntries", () => {
    it("descarta duplicatas e antigas e mantém só a mais recente por chat", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const entries = [
        {
          key: { id: "old", remoteJid: "5511999887766@s.whatsapp.net" },
          messageTimestamp: nowSec - 600,
        },
        {
          key: { id: "a", remoteJid: "5511999887766@s.whatsapp.net" },
          messageTimestamp: nowSec - 10,
        },
        {
          key: { id: "b", remoteJid: "5511999887766@s.whatsapp.net" },
          messageTimestamp: nowSec,
        },
        {
          key: { id: "c", remoteJid: "5511888777666@s.whatsapp.net" },
          messageTimestamp: nowSec,
        },
      ];

      markMessageSeen("inst", "dup");
      entries.push({
        key: { id: "dup", remoteJid: "5511777666555@s.whatsapp.net" },
        messageTimestamp: nowSec,
      });

      const { toProcess, ignored } = await filterInboundEntries("inst", entries, (entry) => {
        const jid = entry.key?.remoteJid || "";
        return jid.split("@")[0];
      });

      expect(toProcess).toHaveLength(2);
      expect(toProcess.map((e) => extractMessageId(e)).sort()).toEqual(["b", "c"]);
      expect(ignored.some((i) => i.reason === "ignored_old")).toBe(true);
      expect(ignored.some((i) => i.reason === "ignored_dup")).toBe(true);
      expect(ignored.some((i) => i.reason === "ignored_batch")).toBe(true);
    });
  });

  describe("welcome debounce", () => {
    it("bloqueia welcome repetido na janela", () => {
      const key = "inst:5511999887766";
      expect(shouldSendWelcome(key)).toBe(true);
      markWelcomeSent(key);
      expect(shouldSendWelcome(key)).toBe(false);
    });
  });
});
