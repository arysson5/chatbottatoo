import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/unit/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "lib/pix-proof-parser.js",
    "lib/pix-proof-pipeline.js",
    "lib/pix-key.js",
    "lib/flow-context.js",
    "lib/flow-interaction-store.js",
    "lib/slot-filters.js",
    "lib/conversation-intent.js",
    "lib/evolution-qrcode.js",
    "lib/flows/flow-store.js",
    "lib/message-media.js",
    "lib/currency.js",
    "lib/webhook-guard.js",
  ],
  coverageDirectory: "coverage",
  testTimeout: 15000,
};

export default createJestConfig(customJestConfig);
