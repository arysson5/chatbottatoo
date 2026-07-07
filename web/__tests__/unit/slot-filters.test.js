import {
  filterSlots,
  paginateSlots,
  parseSlotRequestLocal,
  formatSlotsMessage,
} from "@/lib/slot-filters";
import { MOCK_SLOTS } from "../helpers/mock-data.js";

describe("slot-filters", () => {
  describe("filterSlots", () => {
    it("filtra por dia da semana (sexta = 5)", () => {
      const filtered = filterSlots(MOCK_SLOTS, { weekdays: [5] });

      expect(filtered.length).toBe(3);
      expect(filtered.every((s) => s.label.includes("Sex"))).toBe(true);
    });

    it("filtra por intervalo de datas", () => {
      const filtered = filterSlots(MOCK_SLOTS, {
        dateStart: "2026-06-12T00:00:00.000Z",
        dateEnd: "2026-06-12T23:59:59.999Z",
      });

      expect(filtered.length).toBe(2);
    });

    it("renumera IDs após filtro", () => {
      const filtered = filterSlots(MOCK_SLOTS.slice(0, 3), { weekdays: [1] });
      if (filtered.length) {
        expect(filtered[0].id).toBe(1);
      }
    });
  });

  describe("paginateSlots", () => {
    it("pagina 8 slots por página", () => {
      const { pageSlots, hasMore, total } = paginateSlots(MOCK_SLOTS, 0, 8);

      expect(pageSlots).toHaveLength(8);
      expect(hasMore).toBe(true);
      expect(total).toBe(9);
      expect(pageSlots[0].id).toBe(1);
    });

    it("retorna segunda página corretamente", () => {
      const { pageSlots, hasMore } = paginateSlots(MOCK_SLOTS, 1, 8);

      expect(pageSlots).toHaveLength(1);
      expect(hasMore).toBe(false);
    });
  });

  describe("parseSlotRequestLocal", () => {
    it("detecta pedido de mais horários", () => {
      expect(parseSlotRequestLocal("mais horários")).toEqual({ intent: "show_more" });
      expect(parseSlotRequestLocal("ver mais")).toEqual({ intent: "show_more" });
      expect(parseSlotRequestLocal("próximos")).toEqual({ intent: "show_more" });
    });

    it("detecta filtro por dia da semana", () => {
      const result = parseSlotRequestLocal("prefiro na sexta");

      expect(result).toEqual({ intent: "refine_dates", weekdays: [5] });
    });

    it("detecta semana que vem", () => {
      const result = parseSlotRequestLocal("semana que vem");

      expect(result?.intent).toBe("refine_dates");
      expect(result?.dateStart).toBeDefined();
      expect(result?.dateEnd).toBeDefined();
    });

    it("retorna null para mensagem irrelevante", () => {
      expect(parseSlotRequestLocal("João Silva")).toBeNull();
      expect(parseSlotRequestLocal("1")).toBeNull();
    });
  });

  describe("formatSlotsMessage", () => {
    it("formata lista numerada de horários", () => {
      const msg = formatSlotsMessage(MOCK_SLOTS.slice(0, 2));

      expect(msg).toMatch(/Horários disponíveis/);
      expect(msg).toMatch(/1 - /);
      expect(msg).toMatch(/2 - /);
    });

    it("retorna mensagem quando não há slots", () => {
      const msg = formatSlotsMessage([]);

      expect(msg).toMatch(/Não encontrei horários/i);
    });
  });
});
