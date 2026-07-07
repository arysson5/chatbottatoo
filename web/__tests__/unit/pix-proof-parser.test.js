import { parseProofAmount, parsePixProofFromText } from "@/lib/pix-proof-parser";

const SAMPLE_NUBANK_RECEIPT = `
Comprovante de transferência PIX
Transferência enviada
Para: Maria Brizza Silva
Valor: R$ 200,00
ID da transação: E12345678901234567890123456789012
Pix realizado com sucesso
Nubank
`.trim();

const SAMPLE_ITAU_RECEIPT = `
Comprovante Pix
Pagamento enviado
Favorecido: Matheus Brizza
R$ 150,50
Autenticação: ABC123456789
Transferência via PIX
Itaú
`.trim();

describe("pix-proof-parser", () => {
  describe("parseProofAmount", () => {
    it("converte número direto", () => {
      expect(parseProofAmount(200)).toBe(200);
    });

    it("converte formato brasileiro com vírgula", () => {
      expect(parseProofAmount("200,00")).toBe(200);
      expect(parseProofAmount("1.500,50")).toBe(1500.5);
    });

    it("converte formato com R$", () => {
      expect(parseProofAmount("R$ 200,00")).toBe(200);
    });

    it("retorna 0 para valor inválido", () => {
      expect(parseProofAmount("")).toBe(0);
      expect(parseProofAmount("abc")).toBe(0);
    });
  });

  describe("parsePixProofFromText", () => {
    it("extrai valor, recebedor e ID E2E de comprovante Nubank", () => {
      const result = parsePixProofFromText(SAMPLE_NUBANK_RECEIPT);

      expect(result).not.toBeNull();
      expect(result.amount).toBe(200);
      expect(result.recipientName).toMatch(/Maria Brizza/i);
      expect(result.transactionId).toMatch(/^E[A-Z0-9]{31,32}$/);
      expect(result.isPixReceipt).toBe(true);
      expect(result.receiptConfidence).toBeGreaterThanOrEqual(0.65);
      expect(result.source).toBe("ocr");
    });

    it("extrai valor e autenticação de comprovante Itaú", () => {
      const result = parsePixProofFromText(SAMPLE_ITAU_RECEIPT);

      expect(result).not.toBeNull();
      expect(result.amount).toBe(150.5);
      expect(result.recipientName).toMatch(/Matheus Brizza/i);
      expect(result.transactionId).toBe("ABC123456789");
      expect(result.isPixReceipt).toBe(true);
    });

    it("retorna null para texto curto demais", () => {
      expect(parsePixProofFromText("pix")).toBeNull();
      expect(parsePixProofFromText("")).toBeNull();
    });

    it("identifica comprovante mesmo sem valor explícito", () => {
      const text = "Comprovante de transferência PIX\nPix enviado\nPara: João Silva\nNubank";
      const result = parsePixProofFromText(text);

      expect(result).not.toBeNull();
      expect(result.isPixReceipt).toBe(true);
      expect(result.recipientName).toMatch(/João Silva/i);
    });

    it("extrai valor de padrão R$ isolado", () => {
      const text =
        "Transferência PIX realizada\nPix enviado\nPara: Ana Costa\nR$ 350,00\nNubank comprovante";
      const result = parsePixProofFromText(text);

      expect(result.amount).toBe(350);
    });
  });
});
