// `check` run as a user runs it: the CLI against a real git repo, reading each side of the PR from git.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { createTables } from "../src/db.ts";
import { hashLines } from "../src/hunks.ts";
import { addMessage, startThread } from "../src/threads.ts";
import type { Graph } from "../shared/graph.ts";
import type { Anchor } from "../shared/thread.ts";
import { tempRepo } from "./temp-repo.ts";

const CLI = join(import.meta.dirname, "../src/cli.ts");

test("check reads LEFT at the base and RIGHT at the head, and without flags the base is where the branch left origin/main", () => {
  // The head commit replaces line 2 of a.txt on a branch from the base commit; origin/main has since moved on from
  // the base and changed that line too.
  const { dir, git, write } = tempRepo();
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

  const graph: Graph = {
    schema: "test",
    nodes: [
      { id: randomUUID(), title: "", text: "", code: [{ id: randomUUID(), path: "a.txt", side: "LEFT", line: 2, hash: hashLines(["-two"]), added: 0, removed: 1, text: "" }] },
      { id: randomUUID(), title: "", text: "", code: [{ id: randomUUID(), path: "a.txt", side: "RIGHT", line: 2, hash: hashLines(["-two", "+TWO"]), added: 1, removed: 1, text: "" }] },
      { id: randomUUID(), title: "", text: "", code: [{ id: randomUUID(), path: "b.txt", side: "RIGHT", line: 1, hash: hashLines([" kept"]), added: 0, removed: 0, text: "" }] },
    ],
    edges: [],
  };
  write("graph.json", JSON.stringify(graph));
  const check = (...args: string[]) => spawnSync(process.execPath, [CLI, "check", "graph.json", ...args], { cwd: dir, encoding: "utf8" });

  // "two" and "TWO" each exist on one side only, so reading either from the wrong commit fails.
  expect(check("--base", base, "--head", "HEAD").status).toBe(0);
  // Without flags: the base is where the branch left origin/main (main's "deux" would fail), the head is the working tree.
  expect(check().status).toBe(0);
});

test("with --review, check fails threads a rewritten graph left out of place until each is moved or dropped", () => {
  // Run from inside the repo, as the CLI is, so this test starts threads in the database the CLI opens.
  const cwd = process.cwd();
  const { dir, git, write } = tempRepo();
  process.chdir(dir);
  try {
    write("a.txt", "one\ntwo\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    const node = { id: randomUUID(), title: "Counting", text: "Two follows one.", code: [] };
    write("graph.json", JSON.stringify({ schema: "test", nodes: [node], edges: [] } satisfies Graph));
    createTables();
    const thread = (anchor: Anchor) => startThread({ review: "pr", anchor, base: "HEAD", head: null });
    const onText = thread({ in: "node-text", nodeId: node.id, start: 0, end: 3, quote: "Two" });
    addMessage(onText.id, "user", "Why two?");
    const onCode = thread({ in: "code", path: "a.txt", side: "RIGHT", startLine: 2, endLine: 2, start: 0, end: 3, quote: "two" });
    const check = (...args: string[]) => spawnSync(process.execPath, [CLI, "check", "graph.json", "--base", "HEAD", ...args], { encoding: "utf8" });
    const changeThread = (...args: string[]) => spawnSync(process.execPath, [CLI, "thread", ...args], { encoding: "utf8" });
    expect(check("--review", "pr").status).toBe(0);

    // the graph is rewritten and the code edited
    write("graph.json", JSON.stringify({ schema: "test", nodes: [{ ...node, text: "One comes before two." }], edges: [] } satisfies Graph));
    write("a.txt", "one\n2\n");
    const failed = check("--review", "pr");
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain(`✗ thread ${onText.id}: quote-mismatch`);
    expect(failed.stdout).toContain('now:    "One"');
    expect(failed.stdout).toContain('asked:  "Why two?"');
    expect(failed.stdout).toContain(`✗ thread ${onCode.id}: out-of-range`);
    expect(failed.stdout).toContain("2 of 2 threads in review pr aren't in place");
    // without --review, threads aren't checked
    expect(check().status).toBe(0);

    const moved = changeThread("move", onText.id, JSON.stringify({ in: "node-text", nodeId: node.id, start: 17, end: 20, quote: "two" }));
    expect(moved.stdout).toContain(`moved thread ${onText.id}`);
    expect(changeThread("drop", onCode.id, "the line it asked about is now a digit").status).toBe(0);
    expect(check("--review", "pr").stdout).toContain("ok: all 1 threads in review pr are in place");
    expect(check("--review", "pr").status).toBe(0);

    // what the AI gets wrong is refused
    expect(changeThread("move", onText.id, "{").status).toBe(2);
    expect(changeThread("move", onText.id, JSON.stringify({ in: "node-text", start: 0, end: 1, quote: "O" })).stderr).toContain("that isn't an anchor");
    expect(changeThread("move", randomUUID(), JSON.stringify({ in: "node-text", nodeId: node.id, start: 0, end: 1, quote: "O" })).status).toBe(1);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
