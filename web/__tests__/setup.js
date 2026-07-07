/** Configuração global dos testes unitários. */
process.env.GEMINI_API_KEY = "";
process.env.DATABASE_URL = "";

jest.mock("@/lib/gemini", () => ({
  isGeminiConfigured: jest.fn(() => false),
  parseUserIntent: jest.fn(async () => null),
  parseSlotRequest: jest.fn(async () => null),
  extractPixProofFromImage: jest.fn(async () => null),
}));