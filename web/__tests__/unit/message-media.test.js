import {
  detectPixProofMedia,
  hasPixProofMedia,
  stripBase64Prefix,
  unwrapWhatsAppMessage,
} from "@/lib/message-media";

describe("message-media", () => {
  describe("unwrapWhatsAppMessage", () => {
    it("desembrulha mensagem encaminhada", () => {
      const inner = { imageMessage: { mimetype: "image/jpeg" } };
      const wrapped = { ephemeralMessage: { message: inner } };

      expect(unwrapWhatsAppMessage(wrapped)).toEqual(inner);
    });

    it("retorna mensagem simples sem alteração", () => {
      const msg = { conversation: "oi" };
      expect(unwrapWhatsAppMessage(msg)).toEqual(msg);
    });
  });

  describe("detectPixProofMedia", () => {
    it("detecta imagem de comprovante", () => {
      const result = detectPixProofMedia({
        imageMessage: { mimetype: "image/jpeg", caption: "comprovante" },
      });

      expect(result).toEqual({
        kind: "image",
        mimetype: "image/jpeg",
        caption: "comprovante",
      });
    });

    it("detecta PDF como documento", () => {
      const result = detectPixProofMedia({
        documentMessage: {
          mimetype: "application/pdf",
          fileName: "comprovante.pdf",
        },
      });

      expect(result).toEqual({
        kind: "document",
        mimetype: "application/pdf",
        caption: "",
      });
    });

    it("detecta imagem em documentMessage", () => {
      const result = detectPixProofMedia({
        documentMessage: {
          mimetype: "image/png",
          fileName: "pix.png",
        },
      });

      expect(result?.kind).toBe("image");
    });

    it("retorna null para texto simples", () => {
      expect(detectPixProofMedia({ conversation: "oi" })).toBeNull();
    });

    it("retorna null para documento não suportado", () => {
      expect(
        detectPixProofMedia({
          documentMessage: { mimetype: "application/zip", fileName: "arquivo.zip" },
        }),
      ).toBeNull();
    });
  });

  describe("hasPixProofMedia", () => {
    it("retorna true para imagem", () => {
      expect(hasPixProofMedia({ imageMessage: { mimetype: "image/jpeg" } })).toBe(true);
    });

    it("retorna false para texto", () => {
      expect(hasPixProofMedia({ conversation: "200 reais" })).toBe(false);
    });
  });

  describe("stripBase64Prefix", () => {
    it("remove prefixo data URI", () => {
      expect(stripBase64Prefix("data:image/png;base64,abc123")).toBe("abc123");
    });

    it("mantém base64 puro", () => {
      expect(stripBase64Prefix("abc123")).toBe("abc123");
    });
  });
});
