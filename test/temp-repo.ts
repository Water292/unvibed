// An empty git repo in a temp folder, and a git that can commit in it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "unvibed-"));
  // a name and email for the commits, which CI's git doesn't have
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, encoding: "utf8" }).trim();
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);
  git("init", "-q");
  return { dir, git, write };
}
