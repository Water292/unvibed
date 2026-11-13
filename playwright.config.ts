import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Each spec file starts its own viewer on its own repo; tests in a file share it.
  fullyParallel: false,
  use: { browserName: "chromium", viewport: { width: 1200, height: 800 } },
  reporter: process.env.CI ? "list" : "line",
});
