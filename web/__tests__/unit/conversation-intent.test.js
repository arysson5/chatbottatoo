import {
  matchesMenuOption,
  resolveOptionChoice,
  resolveSlotChoice,
} from "@/lib/conversation-intent";
import { MOCK_SLOTS } from "../helpers/mock-data.js";

describe("conversation-intent", () => {
  describe("matchesMenuOption", () => {
    it("reconhece opções numéricas", () => {
      expect(matchesMenuOption("1", 1)).toBe(true);
      expect(matchesMenuOption("2", 2)).toBe(true);
      expect(matchesMenuOption("3", 3)).toBe(true);
    });

    it("reconhece opções por palavra", () => {
      expect(matchesMenuOption("primeiro", 1)).toBe(true);
      expect(matchesMenuOption("segundo", 2)).toBe(true);
      expect(matchesMenuOption("terceiro", 3)).toBe(true);
    });

    it("reconhece intenções naturais", () => {
      expect(matchesMenuOption("quero agendar", 1)).toBe(true);
      expect(matchesMenuOption("nova tattoo", 1)).toBe(true);
      expect(matchesMenuOption("reformar", 2)).toBe(true);
      expect(matchesMenuOption("complementar", 3)).toBe(true);
    });

    it("rejeita opção incorreta", () => {
      expect(matchesMenuOption("1", 2)).toBe(false);
      expect(matchesMenuOption("reformar", 1)).toBe(false);
    });
  });

  describe("resolveOptionChoice", () => {
    const menuOptions = [
      { id: 1, label: "Nova Tattoo" },
      { id: 2, label: "Reformar" },
      { id: 3, label: "Complementar" },
    ];

    it("resolve opção do menu principal por número", async () => {
      const choice = await resolveOptionChoice({
        state: "menu_principal",
        options: menuOptions,
        userMessage: "1",
      });
      expect(choice).toBe(1);
    });

    it("resolve opção por texto natural no menu", async () => {
      const choice = await resolveOptionChoice({
        state: "menu_principal",
        options: menuOptions,
        userMessage: "quero uma nova tattoo",
      });
      expect(choice).toBe(1);
    });

    it("resolve agendar no pós-orçamento", async () => {
      const choice = await resolveOptionChoice({
        state: "pos_orcamento",
        options: [
          { id: 1, label: "Agendar" },
          { id: 2, label: "Tirar dúvida" },
        ],
        userMessage: "quero agendar",
      });
      expect(choice).toBe(1);
    });

    it("resolve dúvida no pós-orçamento", async () => {
      const choice = await resolveOptionChoice({
        state: "pos_orcamento",
        options: [
          { id: 1, label: "Agendar" },
          { id: 2, label: "Tirar dúvida" },
        ],
        userMessage: "tenho uma dúvida",
      });
      expect(choice).toBe(2);
    });

    it("retorna null para mensagem vazia", async () => {
      const choice = await resolveOptionChoice({
        state: "menu_principal",
        options: menuOptions,
        userMessage: "",
      });
      expect(choice).toBeNull();
    });
  });

  describe("resolveSlotChoice", () => {
    it("resolve escolha de horário por número", async () => {
      const choice = await resolveSlotChoice("2", MOCK_SLOTS.slice(0, 3));
      expect(choice).toBe(2);
    });

    it("resolve escolha por ordinal", async () => {
      const choice = await resolveSlotChoice("segundo", MOCK_SLOTS.slice(0, 3));
      expect(choice).toBe(2);
    });

    it("retorna null para opção inexistente", async () => {
      const choice = await resolveSlotChoice("99", MOCK_SLOTS.slice(0, 3));
      expect(choice).toBeNull();
    });
  });
});
