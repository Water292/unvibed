// `check` run as a user runs it: the CLI against a real git repo.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hashLines } from "../src/check.ts";
import type { Graph } from "../shared/graph.ts";

const CLI = join(import.meta.dirname, "../src/cli.ts");

// A repo whose head commit replaces line 2 of a.txt on a branch from the base commit; origin/main has
// since moved on from the base and changed that line too.
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), "unvibed-check-"));
  const env = { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z" };
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: dir, env, encoding: "utf8" }).trim();
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);
  git("init", "-q", "-b", "main");
  write("a.txt", "one\ntwo\nthree\n");
  write("b.txt", "kept\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");
  write("a.txt", "one\ndeux\nthree\n");
  git("commit", "-q", "-am", "main moves on");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("reset", "-q", "--hard", base);
  write("a.txt", "one\nTWO\nthree\n");
  git("commit", "-q", "-am", "head");
  const check = (...args: string[]) => spawnSync(process.execPath, [CLI, "check", "graph.json", ...args], { cwd: dir, env, encoding: "utf8" });
  return { dir, base, git, write, check };
}

test("check passes on a graph that matches the code, and lists only the location a later commit moved", () => {
  const { base, git, write, check } = makeRepo();
  const graph: Graph = {
    schema: "test",
    nodes: [
      { id: "replaced", title: "", text: "", code: [{ path: "a.txt", side: "LEFT", line: 2, hash: hashLines(["two"]) }] },
      { id: "replacement", title: "", text: "", code: [{ path: "a.txt", side: "RIGHT", line: 2, hash: hashLines(["TWO"]) }] },
      { id: "untouched", title: "", text: "", code: [{ path: "b.txt", side: "RIGHT", line: 1, hash: hashLines(["kept"]) }] },
    ],
    edges: [],
  };
  write("graph.json", JSON.stringify(graph));

  // LEFT is read at the base and RIGHT at the head; "two" and "TWO" each exist on one side only.
  expect(check("--base", base, "--head", "HEAD").status).toBe(0);
  // Without flags: the base is where the branch left origin/main, the head is the working tree.
  expect(check().status).toBe(0);

  // A line added above shifts what the RIGHT location points at.
  write("a.txt", "zero\none\nTWO\nthree\n");
  git("commit", "-q", "-am", "shift");
  const shifted = check();
  expect(shifted.status).toBe(1);
  expect(shifted.stdout).toContain("✗ replacement:");
  expect(shifted.stdout).not.toContain("✗ replaced:");
  expect(shifted.stdout).not.toContain("✗ untouched:");
});
