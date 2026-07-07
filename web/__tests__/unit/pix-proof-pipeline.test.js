import { mergeProofResults } from "@/lib/pix-proof-pipeline";

describe("pix-proof-pipeline mergeProofResults", () => {
  const ocrResult = {
    amount: 200,
    recipientName: "Maria Brizza",
    transactionId: "E12345678901234567890123456789012",
    isPixReceipt: true,
    receiptConfidence: 0.75,
    source: "ocr",
  };

  const geminiResult = {
    amount: 200,
    recipientName: "Maria Brizza Silva",
    transactionId: "E12345678901234567890123456789012",
    isPixReceipt: true,
    receiptConfidence: 0.85,
    nameMatchesExpected: true,
    nameMatchConfidence: 0.9,
    confidence: 0.88,
    modelUsed: "gemini-2.0-flash",
  };

  it("prioriza valor OCR quando disponível", () => {
    const merged = mergeProofResults(ocrResult, { ...geminiResult, amount: 150 });

    expect(merged.amount).toBe(200);
    expect(merged.error).toBeUndefined();
  });

  it("usa valor Gemini quando OCR não extraiu", () => {
    const merged = mergeProofResults({ ...ocrResult, amount: 0 }, geminiResult);

    expect(merged.amount).toBe(200);
  });

  it("combina OCR e Gemini com source both", () => {
    const merged = mergeProofResults(ocrResult, geminiResult);

    expect(merged.verificationSource).toBe("both");
    expect(merged.isPixReceipt).toBe(true);
    expect(merged.transactionId).toBe("E12345678901234567890123456789012");
    expect(merged.receiptConfidence).toBeGreaterThanOrEqual(0.85);
  });

  it("funciona só com OCR", () => {
    const merged = mergeProofResults(ocrResult, null);

    expect(merged.verificationSource).toBe("ocr");
    expect(merged.amount).toBe(200);
    expect(merged.modelUsed).toBeNull();
  });

  it("funciona só com Gemini", () => {
    const merged = mergeProofResults(null, geminiResult);

    expect(merged.verificationSource).toBe("gemini");
    expect(merged.nameMatchesExpected).toBe(true);
  });

  it("retorna erro quota quando Gemini falha por quota", () => {
    const merged = mergeProofResults(null, { error: "quota" });

    expect(merged.error).toBe("quota");
  });

  it("retorna no_data quando ambos ausentes", () => {
    expect(mergeProofResults(null, null)).toEqual({ error: "no_data" });
  });

  it("propaga expectedHolderName", () => {
    const merged = mergeProofResults(ocrResult, geminiResult, "Maria Brizza");

    expect(merged.expectedHolderName).toBe("Maria Brizza");
  });
});
