import { parseCurrencyToNumber, formatBRL } from "@/lib/currency";

describe("currency", () => {
  describe("parseCurrencyToNumber", () => {
    it("converte valores BRL formatados", () => {
      expect(parseCurrencyToNumber("R$ 200,00")).toBe(200);
      expect(parseCurrencyToNumber("R$ 1.500,50")).toBe(1500.5);
    });

    it("retorna 0 para incluido", () => {
      expect(parseCurrencyToNumber("incluido 4")).toBe(0);
    });

    it("retorna 0 para vazio", () => {
      expect(parseCurrencyToNumber("")).toBe(0);
    });
  });

  describe("formatBRL", () => {
    it("formata número para Real brasileiro", () => {
      expect(formatBRL(200)).toMatch(/R\$\s*200,00/);
      expect(formatBRL(1500.5)).toMatch(/1\.500,50/);
    });
  });
});
