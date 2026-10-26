import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Other sessions' git worktrees live under .claude/worktrees/; their tests are not this checkout's.
  // e2e/ holds Playwright's browser tests, run by `mise run e2e`.
  test: { exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"] },
});
