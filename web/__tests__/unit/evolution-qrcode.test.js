import {
  isConnectedState,
  phoneFromInstanceName,
  qrDataUrlFromPayload,
  fetchConnectWithQr,
} from "@/lib/evolution-qrcode";

describe("evolution-qrcode", () => {
  describe("isConnectedState", () => {
    it("reconhece estados conectados", () => {
      expect(isConnectedState("open")).toBe(true);
      expect(isConnectedState("connected")).toBe(true);
      expect(isConnectedState("OPEN")).toBe(true);
    });

    it("rejeita estados desconectados", () => {
      expect(isConnectedState("close")).toBe(false);
      expect(isConnectedState("connecting")).toBe(false);
      expect(isConnectedState("")).toBe(false);
    });
  });

  describe("phoneFromInstanceName", () => {
    it("extrai número de instância briza-{digits}", () => {
      expect(phoneFromInstanceName("briza-5511988501368")).toBe("5511988501368");
      expect(phoneFromInstanceName("briza-5511999887766")).toBe("5511999887766");
    });

    it("retorna vazio para nome inválido", () => {
      expect(phoneFromInstanceName("outra-instancia")).toBe("");
      expect(phoneFromInstanceName("briza-123")).toBe("");
      expect(phoneFromInstanceName("")).toBe("");
    });
  });

  describe("qrDataUrlFromPayload", () => {
    it("retorna base64 existente com prefixo data:", async () => {
      const dataUrl = "data:image/png;base64,abc123";
      const result = await qrDataUrlFromPayload({ base64: dataUrl });

      expect(result).toBe(dataUrl);
    });

    it("adiciona prefixo data: quando base64 sem prefixo", async () => {
      const result = await qrDataUrlFromPayload({ base64: "abc123" });

      expect(result).toBe("data:image/png;base64,abc123");
    });

    it("gera QR a partir de code string", async () => {
      const result = await qrDataUrlFromPayload({ code: "2@test-qr-code-payload" });

      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it("retorna null para payload vazio", async () => {
      expect(await qrDataUrlFromPayload(null)).toBeNull();
      expect(await qrDataUrlFromPayload({})).toBeNull();
    });
  });

  describe("fetchConnectWithQr", () => {
    it("retorna QR quando Evolution responde com base64", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ base64: "abc123", pairingCode: "ABCD-1234" }),
      });

      const result = await fetchConnectWithQr({
        baseUrl: "http://evolution.test",
        apiKey: "key",
        instanceName: "briza-5511999887766",
        fetchImpl: mockFetch,
      });

      expect(result.ok).toBe(true);
      expect(result.data.qrcodeDataUrl).toBe("data:image/png;base64,abc123");
      expect(result.data.pairingCode).toBe("ABCD-1234");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/instance/connect/briza-5511999887766"),
        expect.objectContaining({ headers: { apikey: "key" } }),
      );
    });

    it("retorna erro quando Evolution falha", async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: "Instância não encontrada" }),
      });

      const result = await fetchConnectWithQr({
        baseUrl: "http://evolution.test",
        apiKey: "key",
        instanceName: "briza-5511999887766",
        fetchImpl: mockFetch,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Instância não encontrada/i);
    });

    it("retorna 503 após tentativas sem QR", async () => {
      jest.useFakeTimers();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ count: 0 }),
      });

      const promise = fetchConnectWithQr({
        baseUrl: "http://evolution.test",
        apiKey: "key",
        instanceName: "briza-5511999887766",
        fetchImpl: mockFetch,
      });

      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      jest.useRealTimers();
    }, 30000);
  });
});
