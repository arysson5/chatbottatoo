import {
  extractAreaNumbers,
  areasExist,
  suggestSplitFromInvalidAreas,
  resolveAreaSelection,
  formatAreasList,
  buildAreaConfirmMessage,
  isAreaConfirmationAffirmative,
} from "@/lib/pricing-areas";

function table(...areas) {
  return areas.map((area) => ({ area, tattooNova: `R$ ${area}00` }));
}

describe("pricing-areas area selection", () => {
  describe("extractAreaNumbers", () => {
    it("parseia 1,3,4", () => {
      expect(extractAreaNumbers("1,3,4")).toEqual([1, 3, 4]);
    });

    it("parseia 134 como um único número", () => {
      expect(extractAreaNumbers("134")).toEqual([134]);
    });

    it("parseia com espaços e 'e'", () => {
      expect(extractAreaNumbers("1, 3 e 4")).toEqual([1, 3, 4]);
    });
  });

  describe("areasExist", () => {
    it("retorna true quando todas existem", () => {
      expect(areasExist([1, 3, 4], table(1, 3, 4))).toBe(true);
    });

    it("retorna false quando alguma não existe", () => {
      expect(areasExist([134], table(1, 3, 4))).toBe(false);
    });
  });

  describe("suggestSplitFromInvalidAreas", () => {
    it("sugere 1,3,4 a partir de 134", () => {
      expect(suggestSplitFromInvalidAreas([134], table(1, 3, 4))).toEqual([1, 3, 4]);
    });

    it("sugere 1,2 a partir de 12 quando 12 não existe", () => {
      expect(suggestSplitFromInvalidAreas([12], table(1, 2))).toEqual([1, 2]);
    });

    it("não sugere quando a área existe (ex.: 19)", () => {
      expect(suggestSplitFromInvalidAreas([19], table(1, 3, 4, 19))).toBeNull();
    });

    it("não sugere quando dígitos não existem (99)", () => {
      expect(suggestSplitFromInvalidAreas([99], table(1, 3, 4))).toBeNull();
    });

    it("mantém áreas válidas e split das inválidas", () => {
      expect(suggestSplitFromInvalidAreas([1, 34], table(1, 3, 4))).toEqual([1, 3, 4]);
    });
  });

  describe("resolveAreaSelection", () => {
    it("1,3,4 válido", () => {
      expect(resolveAreaSelection("1,3,4", table(1, 3, 4))).toEqual({
        status: "valid",
        areas: [1, 3, 4],
      });
    });

    it("134 pede confirmação", () => {
      expect(resolveAreaSelection("134", table(1, 3, 4))).toEqual({
        status: "confirm",
        suggestedAreas: [1, 3, 4],
      });
    });

    it("19 válido quando existe no catálogo", () => {
      expect(resolveAreaSelection("19", table(1, 3, 4, 19))).toEqual({
        status: "valid",
        areas: [19],
      });
    });

    it("99 pede reenvio", () => {
      expect(resolveAreaSelection("99", table(1, 3, 4))).toEqual({ status: "retry" });
    });

    it("12 válido quando área 12 existe", () => {
      expect(resolveAreaSelection("12", table(1, 2, 12))).toEqual({
        status: "valid",
        areas: [12],
      });
    });

    it("12 sugere split quando 12 não existe", () => {
      expect(resolveAreaSelection("12", table(1, 2))).toEqual({
        status: "confirm",
        suggestedAreas: [1, 2],
      });
    });

    it("texto sem números retorna empty", () => {
      expect(resolveAreaSelection("olá", table(1, 3, 4))).toEqual({ status: "empty" });
    });
  });

  describe("formatAreasList / buildAreaConfirmMessage", () => {
    it("formata lista com e", () => {
      expect(formatAreasList([1, 3, 4])).toBe("1, 3 e 4");
    });

    it("monta mensagem de confirmação", () => {
      const msg = buildAreaConfirmMessage([1, 3, 4]);
      expect(msg).toMatch(/1, 3 e 4/);
      expect(msg).toMatch(/sim/i);
      expect(msg).toMatch(/vírgula/i);
    });
  });

  describe("isAreaConfirmationAffirmative", () => {
    it("reconhece sim e variações", () => {
      expect(isAreaConfirmationAffirmative("sim")).toBe(true);
      expect(isAreaConfirmationAffirmative("Sim!")).toBe(true);
      expect(isAreaConfirmationAffirmative("s")).toBe(true);
      expect(isAreaConfirmationAffirmative("isso")).toBe(true);
      expect(isAreaConfirmationAffirmative("confirmo")).toBe(true);
      expect(isAreaConfirmationAffirmative("1,3,4")).toBe(false);
      expect(isAreaConfirmationAffirmative("não")).toBe(false);
    });
  });
});
