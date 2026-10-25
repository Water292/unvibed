import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Other sessions' git worktrees live under .claude/worktrees/; their tests are not this checkout's.
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
