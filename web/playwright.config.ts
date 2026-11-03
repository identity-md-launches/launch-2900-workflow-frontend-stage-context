import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  outputDir: "../test/scratch/interaction-results",
  reporter: [
    ["list"],
    ["json", { outputFile: "../test/scratch/interaction-results.json" }],
  ],
  webServer: {
    command: "node scripts/serve.mjs --port 4175",
    url: "http://127.0.0.1:4175/preview/",
    reuseExistingServer: false,
    timeout: 15000,
  },
  use: {
    baseURL: "http://127.0.0.1:4175/preview/",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
});
