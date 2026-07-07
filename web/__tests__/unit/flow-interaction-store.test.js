import {
  hydrateInteractionMaps,
  getInteraction,
  isInteractionExpired,
  INTERACTION_STEPS,
} from "@/lib/flow-interaction-store";

const TEST_NUMBER = "5511999887766";

describe("flow-interaction-store", () => {
  describe("isInteractionExpired", () => {
    it("retorna false quando expiresAt está no futuro", () => {
      const row = { expiresAt: new Date(Date.now() + 3600000).toISOString() };
      expect(isInteractionExpired(row)).toBe(false);
    });

    it("retorna true quando expiresAt passou", () => {
      const row = { expiresAt: new Date(Date.now() - 1000).toISOString() };
      expect(isInteractionExpired(row)).toBe(true);
    });

    it("retorna false quando não há expiresAt", () => {
      expect(isInteractionExpired({})).toBe(false);
    });
  });

  describe("getInteraction", () => {
    const db = {
      pendingInteractions: [
        {
          number: TEST_NUMBER,
          step: INTERACTION_STEPS.MAIN_MENU,
          data: { createdAt: Date.now() },
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          number: TEST_NUMBER,
          step: INTERACTION_STEPS.POST_QUOTE,
          data: { total: 5000 },
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    };

    it("retorna dados da interação ativa", () => {
      const data = getInteraction(db, TEST_NUMBER, INTERACTION_STEPS.MAIN_MENU);
      expect(data).toEqual({ createdAt: expect.any(Number) });
    });

    it("retorna null para interação expirada", () => {
      const data = getInteraction(db, TEST_NUMBER, INTERACTION_STEPS.POST_QUOTE);
      expect(data).toBeNull();
    });

    it("retorna null quando interação não existe", () => {
      expect(getInteraction(db, "5511000000000", INTERACTION_STEPS.MAIN_MENU)).toBeNull();
    });
  });

  describe("hydrateInteractionMaps", () => {
    it("restaura Maps em memória a partir do banco", () => {
      const now = Date.now();
      const db = {
        pendingInteractions: [
          {
            number: TEST_NUMBER,
            step: INTERACTION_STEPS.MAIN_MENU,
            data: { createdAt: now },
            updatedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 86400000).toISOString(),
          },
          {
            number: "5511888777666",
            step: INTERACTION_STEPS.CATALOG_AREAS,
            data: { createdAt: now },
            updatedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 86400000).toISOString(),
          },
          {
            number: "5511777666555",
            step: INTERACTION_STEPS.POST_QUOTE,
            data: { total: 3000, createdAt: now },
            updatedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + 86400000).toISOString(),
          },
        ],
      };

      const maps = {
        pendingPollByNumber: new Map(),
        pendingCatalogAreasByNumber: new Map(),
        pendingPostQuoteChoiceByNumber: new Map(),
        pendingHandoffAreasByNumber: new Map(),
        pendingHandoffPhotosByNumber: new Map(),
      };

      hydrateInteractionMaps(db, maps);

      expect(maps.pendingPollByNumber.has(TEST_NUMBER)).toBe(true);
      expect(maps.pendingCatalogAreasByNumber.has("5511888777666")).toBe(true);
      expect(maps.pendingPostQuoteChoiceByNumber.get("5511777666555")).toEqual(
        expect.objectContaining({ total: 3000 }),
      );
    });

    it("ignora interações expiradas na hidratação", () => {
      const db = {
        pendingInteractions: [
          {
            number: TEST_NUMBER,
            step: INTERACTION_STEPS.MAIN_MENU,
            data: {},
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        ],
      };
      const maps = { pendingPollByNumber: new Map() };

      hydrateInteractionMaps(db, maps);

      expect(maps.pendingPollByNumber.size).toBe(0);
    });
  });
});
