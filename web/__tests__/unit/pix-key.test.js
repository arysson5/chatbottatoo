import { recipientNamesMatch, verifyPixProofRecipient } from "@/lib/pix-key";

describe("pix-key", () => {
  describe("recipientNamesMatch", () => {
    it("aceita nomes idênticos", () => {
      expect(recipientNamesMatch("Maria Brizza", "Maria Brizza")).toBe(true);
    });

    it("aceita nomes com acentos diferentes", () => {
      expect(recipientNamesMatch("José Silva", "Jose Silva")).toBe(true);
    });

    it("aceita nome parcial contido", () => {
      expect(recipientNamesMatch("Maria Brizza", "Maria Brizza Silva")).toBe(true);
    });

    it("aceita match por partes do nome", () => {
      expect(recipientNamesMatch("Matheus Brizza", "Matheus A Brizza")).toBe(true);
    });

    it("rejeita nomes completamente diferentes", () => {
      expect(recipientNamesMatch("Maria Brizza", "João Pedro")).toBe(false);
    });

    it("rejeita quando algum nome está vazio", () => {
      expect(recipientNamesMatch("", "Maria")).toBe(false);
      expect(recipientNamesMatch("Maria", "")).toBe(false);
    });
  });

  describe("verifyPixProofRecipient", () => {
    const settings = { pixHolderName: "Maria Brizza Silva" };

    it("aprova quando Gemini confirma nome com alta confiança", () => {
      const proof = { nameMatchesExpected: true, nameMatchConfidence: 0.85 };
      const result = verifyPixProofRecipient(proof, settings);

      expect(result.verified).toBe(true);
      expect(result.method).toBe("gemini_name_match");
    });

    it("aprova match local do OCR", () => {
      const proof = { recipientName: "Maria Brizza" };
      const result = verifyPixProofRecipient(proof, settings);

      expect(result.verified).toBe(true);
      expect(result.method).toBe("local_name_match");
    });

    it("rejeita recebedor incorreto", () => {
      const proof = { recipientName: "Outra Pessoa" };
      const result = verifyPixProofRecipient(proof, settings);

      expect(result.verified).toBe(false);
      expect(result.method).toBe("none");
    });

    it("aprova automaticamente se pixHolderName não configurado", () => {
      const result = verifyPixProofRecipient({ recipientName: "Qualquer" }, {});

      expect(result.verified).toBe(true);
      expect(result.method).toBe("no_name_configured");
    });
  });
});
