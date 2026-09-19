/**
 * Cenários críticos pós anti-flood / multi-número:
 * - Queda de sinal + sync de histórico não pode flodar
 * - Humano assume conversa: bot silenciado ao voltar
 * - Estresse com 3–4 linhas isoladas
 */
import {
  MESSAGE_MAX_AGE_MS,
  WELCOME_DEBOUNCE_MS,
  _resetWebhookGuardForTests,
  extractMessageId,
  filterInboundEntries,
  isMessageTooOld,
  markMessageSeen,
  markWelcomeSent,
  shouldSendWelcome,
  tryAcquireChatLock,
  releaseChatLock,
  wasMessageSeen,
  withOutboundRateLimit,
} from "@/lib/webhook-guard";
import { makeScopeKey, rowMatchesScope } from "@/lib/scope-key";
import {
  HANDOFF_MUTE_DAYS,
  isMuteActive,
  muteNumberInDraft,
  normalizeMutedList,
  resolveHandoffMutes,
  splitActiveAndExpiredMutes,
} from "@/lib/handoff-mute";
import {
  getPendingSchedule,
  hasSchedulingFlow,
} from "@/lib/flows/flow-store";
import { isManagedInstance, normalizeManagedNumbersList } from "@/lib/managed-numbers";
import { extractConnectionState } from "@/lib/evolution-bot-ops";

const CLIENT = "5511999887766";
const INSTANCES = [
  "briza-5511911111111",
  "briza-5511922222222",
  "briza-5511933333333",
  "briza-5511944444444",
];

function makeEntry(id, number, ageMs = 0) {
  const ts = Math.floor((Date.now() - ageMs) / 1000);
  return {
    key: { id, remoteJid: `${number}@s.whatsapp.net`, fromMe: false },
    messageTimestamp: ts,
    message: { conversation: `msg-${id}` },
  };
}

describe("queda de sinal / reconnect sem flood", () => {
  beforeEach(() => {
    _resetWebhookGuardForTests();
  });

  it("ignora histórico antigo após reconnect (msgs > 3 min)", async () => {
    const backlog = Array.from({ length: 25 }, (_, i) =>
      makeEntry(`hist-${i}`, CLIENT, MESSAGE_MAX_AGE_MS + 60_000 + i * 1000),
    );
    const { toProcess, ignored } = await filterInboundEntries(
      INSTANCES[0],
      backlog,
      (e) => e.key.remoteJid.split("@")[0],
    );

    expect(toProcess).toHaveLength(0);
    expect(ignored.every((i) => i.reason === "ignored_old")).toBe(true);
    expect(ignored.length).toBe(25);
  });

  it("no sync misto processa só a msg recente do chat", async () => {
    const entries = [
      ...Array.from({ length: 12 }, (_, i) =>
        makeEntry(`old-${i}`, CLIENT, MESSAGE_MAX_AGE_MS + 10_000),
      ),
      makeEntry("fresh-1", CLIENT, 5_000),
      makeEntry("fresh-2", CLIENT, 1_000),
    ];
    const { toProcess, ignored } = await filterInboundEntries(
      INSTANCES[0],
      entries,
      (e) => e.key.remoteJid.split("@")[0],
    );

    expect(toProcess).toHaveLength(1);
    expect(extractMessageId(toProcess[0])).toBe("fresh-2");
    expect(ignored.some((i) => i.reason === "ignored_old")).toBe(true);
    expect(ignored.some((i) => i.reason === "ignored_batch")).toBe(true);
  });

  it("dedupe impede reprocessar os mesmos IDs após bot voltar", async () => {
    const entries = [makeEntry("same-1", CLIENT, 2_000), makeEntry("same-2", CLIENT, 1_000)];
    const first = await filterInboundEntries(INSTANCES[0], entries, (e) =>
      e.key.remoteJid.split("@")[0],
    );
    expect(first.toProcess).toHaveLength(1);
    expect(extractMessageId(first.toProcess[0])).toBe("same-2");
    // IDs do batch (vencedor + descartados) ficam marcados
    for (const entry of entries) {
      markMessageSeen(INSTANCES[0], extractMessageId(entry));
    }

    const second = await filterInboundEntries(INSTANCES[0], entries, (e) =>
      e.key.remoteJid.split("@")[0],
    );
    expect(second.toProcess).toHaveLength(0);
    expect(second.ignored.every((i) => i.reason === "ignored_dup")).toBe(true);
  });

  it("batch marca IDs descartados como vistos (não voltam no reconnect)", async () => {
    const entries = [makeEntry("b1", CLIENT, 3_000), makeEntry("b2", CLIENT, 500)];
    await filterInboundEntries(INSTANCES[0], entries, (e) => e.key.remoteJid.split("@")[0]);
    expect(wasMessageSeen(INSTANCES[0], "b1")).toBe(true);
    expect(wasMessageSeen(INSTANCES[0], "b2")).toBe(false);

    const again = await filterInboundEntries(INSTANCES[0], [makeEntry("b1", CLIENT, 2_000)], (e) =>
      e.key.remoteJid.split("@")[0],
    );
    expect(again.toProcess).toHaveLength(0);
  });

  it("welcome debounce bloqueia rajada de boas-vindas pós-queda", () => {
    const scope = makeScopeKey(INSTANCES[0], CLIENT);
    expect(shouldSendWelcome(scope)).toBe(true);
    markWelcomeSent(scope);
    expect(shouldSendWelcome(scope)).toBe(false);
    expect(WELCOME_DEBOUNCE_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it("CONNECTION_UPDATE close/open é detectável no payload", () => {
    expect(extractConnectionState({ data: { state: "close" } })).toContain("close");
    expect(extractConnectionState({ data: { state: "open" } })).toContain("open");
    expect(extractConnectionState({ event: "connection.update", state: "connecting" })).toContain(
      "connecting",
    );
  });

  it("chat lock evita webhook paralelo no mesmo chat após reconnect", () => {
    const scope = makeScopeKey(INSTANCES[0], CLIENT);
    expect(tryAcquireChatLock(scope)).toBe(true);
    expect(tryAcquireChatLock(scope)).toBe(false);
    releaseChatLock(scope);
    expect(tryAcquireChatLock(scope)).toBe(true);
    releaseChatLock(scope);
  });
});

describe("humano assume número — bot não responde ao voltar", () => {
  const instance = INSTANCES[1];
  const number = CLIENT;

  it("mute por handoff fica ativo por pelo menos 1 dia", () => {
    const draft = { mutedLeadNumbers: [], leads: [] };
    muteNumberInDraft(draft, number, "human_takeover_mid_flow", instance);

    expect(isMuteActive(draft.mutedLeadNumbers, number, instance)).toBe(true);

    const entry = normalizeMutedList(draft.mutedLeadNumbers)[0];
    const ttlMs = new Date(entry.expiresAt).getTime() - new Date(entry.mutedAt).getTime();
    expect(ttlMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    expect(HANDOFF_MUTE_DAYS).toBeGreaterThanOrEqual(1);
  });

  it("após ~1 dia de atendimento humano o mute ainda silencia o bot na mesma linha", () => {
    const mutedAt = Date.now() - 20 * 60 * 60 * 1000; // 20h atrás
    const list = [
      {
        instance,
        number,
        reason: "human_assistance_requested",
        mutedAt: new Date(mutedAt).toISOString(),
        expiresAt: new Date(mutedAt + HANDOFF_MUTE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    expect(isMuteActive(list, number, instance)).toBe(true);

    const scope = makeScopeKey(instance, number);
    const scopes = new Set(
      normalizeMutedList(list)
        .filter((e) => Date.now() < new Date(e.expiresAt).getTime())
        .map((e) => makeScopeKey(e.instance, e.number)),
    );
    expect(scopes.has(scope)).toBe(true);
  });

  it("mute numa linha não silencia a mesma pessoa em outra linha", () => {
    const draft = { mutedLeadNumbers: [], leads: [] };
    muteNumberInDraft(draft, number, "handoff_started", INSTANCES[0]);

    expect(isMuteActive(draft.mutedLeadNumbers, number, INSTANCES[0])).toBe(true);
    expect(isMuteActive(draft.mutedLeadNumbers, number, INSTANCES[2])).toBe(false);
  });

  it("resolveHandoffMutes devolve scopeKey e limpa expirados", async () => {
    const expiredNumber = "5511888777666";
    const db = {
      leads: [],
      mutedLeadNumbers: [
        {
          instance,
          number,
          reason: "handoff",
          mutedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          instance,
          number: expiredNumber,
          reason: "handoff",
          mutedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    };

    let saved = null;
    const updateDb = async (fn) => {
      saved = fn({ ...db, mutedLeadNumbers: [...db.mutedLeadNumbers] });
      return saved;
    };

    const scopes = await resolveHandoffMutes(db, updateDb);
    expect(scopes.has(makeScopeKey(instance, number))).toBe(true);
    expect(scopes.has(makeScopeKey(instance, expiredNumber))).toBe(false);
    expect(saved?.mutedLeadNumbers).toHaveLength(1);
  });

  it("splitActiveAndExpiredMutes separa corretamente", () => {
    const db = {
      mutedLeadNumbers: [
        {
          instance: "a",
          number: "1",
          mutedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 100000).toISOString(),
        },
        {
          instance: "a",
          number: "2",
          mutedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    };
    const { activeMutedScopes, expiredNumbers } = splitActiveAndExpiredMutes(db);
    expect(activeMutedScopes.has(makeScopeKey("a", "1"))).toBe(true);
    expect(expiredNumbers).toContain("2");
  });
});

describe("estresse multi-número (3–4 linhas)", () => {
  beforeEach(() => {
    _resetWebhookGuardForTests();
  });

  it("isManagedInstance reconhece as 4 linhas cadastradas", () => {
    const managed = normalizeManagedNumbersList(
      INSTANCES.map((inst) => ({
        number: inst.replace(/\D/g, "").slice(-13),
        name: inst,
      })),
    );
    // extractInstanceDigits pega 10-15 dígitos do final do nome
    for (const inst of INSTANCES) {
      expect(isManagedInstance(inst, managed)).toBe(true);
    }
    expect(isManagedInstance("briza-5511999999999", managed)).toBe(false);
  });

  it("4 instâncias no mesmo batch: 1 msg recente por chat", async () => {
    const entries = [];
    for (const inst of INSTANCES) {
      const digits = inst.match(/(\d{10,15})$/)?.[1] || "5511999887766";
      // 5 antigas + 2 recentes por linha (mesmo cliente em todas)
      for (let i = 0; i < 5; i += 1) {
        entries.push({
          ...makeEntry(`${inst}-old-${i}`, CLIENT, MESSAGE_MAX_AGE_MS + 5000),
          _instance: inst,
        });
      }
      entries.push({ ...makeEntry(`${inst}-f1`, CLIENT, 8000), _instance: inst });
      entries.push({ ...makeEntry(`${inst}-f2`, CLIENT, 500), _instance: inst });
    }

    // filter é por instance — simula 4 webhooks
    let totalProcess = 0;
    for (const inst of INSTANCES) {
      const batch = entries.filter((e) => e._instance === inst);
      const { toProcess } = await filterInboundEntries(inst, batch, (e) =>
        e.key.remoteJid.split("@")[0],
      );
      totalProcess += toProcess.length;
      expect(toProcess).toHaveLength(1);
      expect(extractMessageId(toProcess[0])).toBe(`${inst}-f2`);
    }
    expect(totalProcess).toBe(4);
  });

  it("estado de agendamento isolado entre 4 linhas para o mesmo cliente", () => {
    const db = {
      pendingSchedules: INSTANCES.map((inst, idx) => ({
        number: CLIENT,
        instance: inst,
        step: idx % 2 === 0 ? "name" : "slot_choice",
      })),
      pendingPayments: [],
    };

    for (let i = 0; i < INSTANCES.length; i += 1) {
      const schedule = getPendingSchedule(db, CLIENT, INSTANCES[i]);
      expect(schedule).not.toBeNull();
      expect(schedule.step).toBe(i % 2 === 0 ? "name" : "slot_choice");
      expect(hasSchedulingFlow(db, CLIENT, INSTANCES[i])).toBe(true);
    }
    expect(hasSchedulingFlow(db, CLIENT, "briza-desconhecida")).toBe(false);
  });

  it("welcome debounce independente por linha (4 scopes)", () => {
    for (const inst of INSTANCES) {
      const scope = makeScopeKey(inst, CLIENT);
      expect(shouldSendWelcome(scope)).toBe(true);
      markWelcomeSent(scope);
    }
    for (const inst of INSTANCES) {
      expect(shouldSendWelcome(makeScopeKey(inst, CLIENT))).toBe(false);
    }
    // outro cliente na linha 0 ainda pode receber welcome
    expect(shouldSendWelcome(makeScopeKey(INSTANCES[0], "5511888000111"))).toBe(true);
  });

  it("locks paralelos: 4 chats diferentes adquirem lock ao mesmo tempo", () => {
    const keys = INSTANCES.map((inst) => makeScopeKey(inst, CLIENT));
    for (const key of keys) {
      expect(tryAcquireChatLock(key)).toBe(true);
    }
    for (const key of keys) {
      expect(tryAcquireChatLock(key)).toBe(false);
    }
    for (const key of keys) {
      releaseChatLock(key);
    }
  });

  it("rate-limit serializa envios na mesma instância sob estresse", async () => {
    const started = Date.now();
    const order = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        withOutboundRateLimit(INSTANCES[0], async () => {
          order.push(n);
          return n;
        }),
      ),
    );
    const elapsed = Date.now() - started;
    // 5 envios com gap mínimo 400ms ⇒ pelo menos ~1.6s entre o 1º e o 5º
    expect(elapsed).toBeGreaterThanOrEqual(1400);
    expect(order).toHaveLength(5);
  });

  it("rowMatchesScope não cruza instâncias sob carga de 4 linhas", () => {
    const rows = INSTANCES.map((inst) => ({ number: CLIENT, instance: inst, step: "pix" }));
    for (const inst of INSTANCES) {
      const hits = rows.filter((r) => rowMatchesScope(r, CLIENT, inst));
      expect(hits).toHaveLength(1);
      expect(hits[0].instance).toBe(inst);
    }
  });

  it("mute em 2 de 4 linhas: só essas ficam silenciadas", () => {
    const draft = { mutedLeadNumbers: [], leads: [] };
    muteNumberInDraft(draft, CLIENT, "handoff", INSTANCES[0]);
    muteNumberInDraft(draft, CLIENT, "handoff", INSTANCES[2]);

    expect(isMuteActive(draft.mutedLeadNumbers, CLIENT, INSTANCES[0])).toBe(true);
    expect(isMuteActive(draft.mutedLeadNumbers, CLIENT, INSTANCES[1])).toBe(false);
    expect(isMuteActive(draft.mutedLeadNumbers, CLIENT, INSTANCES[2])).toBe(true);
    expect(isMuteActive(draft.mutedLeadNumbers, CLIENT, INSTANCES[3])).toBe(false);
  });
});
