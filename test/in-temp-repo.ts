// For a test file whose code runs git in the current directory: one temp repo that every test in the file runs
// inside, removed after them.
import { rmSync } from "node:fs";
import { afterAll, beforeAll } from "vitest";
import { tempRepo } from "./temp-repo.ts";

/** Sets the temp repo up for the file's tests; call the function it returns, from a hook or a test, for the repo. */
export function inTempRepo(): () => ReturnType<typeof tempRepo> {
  let repo: ReturnType<typeof tempRepo> | undefined;
  let cwd: string;
  beforeAll(() => {
    cwd = process.cwd();
    repo = tempRepo();
    process.chdir(repo.dir);
  });
  afterAll(() => {
    process.chdir(cwd);
    rmSync(repo!.dir, { recursive: true, force: true });
  });
  return () => repo!;
}
