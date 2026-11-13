import { defineConfig } from "@playwright/test";
import base from "./playwright.config.ts";

// The perf test: the browser tests' settings, on perf/ instead of e2e/. Only `mise run perf` uses this config, so the
// browser tests never run it.
export default defineConfig({ ...base, testDir: "perf" });
