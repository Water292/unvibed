// `check` run as a user runs it: the CLI against a real git repo, reading each side of the PR from git.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hashLines } from "../src/check.ts";
import type { Graph } from "../shared/graph.ts";
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
      { id: "replaced", title: "", text: "", code: [{ path: "a.txt", side: "LEFT", line: 2, hash: hashLines(["two"]) }] },
      { id: "replacement", title: "", text: "", code: [{ path: "a.txt", side: "RIGHT", line: 2, hash: hashLines(["TWO"]) }] },
      { id: "untouched", title: "", text: "", code: [{ path: "b.txt", side: "RIGHT", line: 1, hash: hashLines(["kept"]) }] },
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
