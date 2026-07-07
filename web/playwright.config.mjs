import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDbFile = path.join(__dirname, "__tests__", "data", "app-db.test.json");

const sharedEnv = {
  DATABASE_URL: "",
  TEST_DB_FILE: testDbFile,
  GEMINI_API_KEY: "",
  EVOLUTION_GLOBAL_API_KEY: "test-api-key-e2e",
  EVOLUTION_BASE_URL: "http://127.0.0.1:9999",
  WEBHOOK_PUBLIC_URL: "http://127.0.0.1:3000",
};

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: { ...process.env, ...sharedEnv },
  },
};

export default config;
