// `check` run as a user runs it: the CLI against a real git repo, reading each side of the PR from git.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { hashLines } from "../src/hunks.ts";
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
      { id: "replaced", title: "", text: "", code: [{ path: "a.txt", side: "LEFT", line: 2, hash: hashLines(["-two"]), added: 0, removed: 1 }] },
      { id: "replacement", title: "", text: "", code: [{ path: "a.txt", side: "RIGHT", line: 2, hash: hashLines(["-two", "+TWO"]), added: 1, removed: 1 }] },
      { id: "untouched", title: "", text: "", code: [{ path: "b.txt", side: "RIGHT", line: 1, hash: hashLines([" kept"]), added: 0, removed: 0 }] },
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

test("stamp fills in what check compares, and writes nothing if a location can't be read", () => {
  const { dir, git, write } = tempRepo();
  write("a.txt", "one\ntwo\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const base = git("rev-parse", "HEAD");
  write("a.txt", "one\nTWO\n");
  const location = (line: number) => ({ path: "a.txt", side: "RIGHT" as const, line, hash: "", added: 0, removed: 0 });
  const run = (command: string) => spawnSync(process.execPath, [CLI, command, "graph.json", "--base", base], { cwd: dir, encoding: "utf8" });
  const graphWith = (line: number): Graph => ({ schema: "test", nodes: [{ id: "n", title: "", text: "", code: [location(line)] }], edges: [] });
  const stored = () => JSON.parse(readFileSync(join(dir, "graph.json"), "utf8")).nodes[0].code[0];

  write("graph.json", JSON.stringify(graphWith(9)));
  expect(run("stamp").status).toBe(1);
  expect(stored().hash).toBe("");

  write("graph.json", JSON.stringify(graphWith(2)));
  expect(run("check").status).toBe(1);
  expect(run("stamp").status).toBe(0);
  expect(stored()).toMatchObject({ hash: hashLines(["-two", "+TWO"]), added: 1, removed: 1 });
  expect(run("check").status).toBe(0);
});
