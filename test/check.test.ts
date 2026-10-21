import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { check, hashLines, type ReadFile } from "../src/check.ts";
import type { Graph } from "../src/graph.ts";

// One node explaining lines 2–3 ("two", "three") of a file.
const graph: Graph = {
  schema: "test",
  nodes: [
    {
      id: "n",
      title: "t",
      text: "",
      code: [{ path: "example.ts", side: "RIGHT", start_line: 2, line: 3, hash: hashLines(["two", "three"]) }],
    },
  ],
  edges: [],
};

test("the hash is git's blob hash of the lines", () => {
  const lines = ["// naïve → café", "🤖"];
  const git = execFileSync("git", ["hash-object", "--stdin"], { input: lines.join("\n") }).toString().trim();
  expect(hashLines(lines)).toBe(git);
});

test("untouched code passes", () => {
  const readFile: ReadFile = () => "one\ntwo\nthree\nfour\n";
  expect(check(graph, readFile)).toEqual([]);
});

test("editing a line the node explains fails", () => {
  const readFile: ReadFile = () => "one\nTWO\nthree\nfour\n";
  expect(check(graph, readFile)).toMatchObject([{ reason: "hash-mismatch", actual: ["TWO", "three"] }]);
});

test("code shifting under the node fails", () => {
  const readFile: ReadFile = () => "zero\none\ntwo\nthree\nfour\n";
  expect(check(graph, readFile)).toMatchObject([{ reason: "hash-mismatch", actual: ["one", "two"] }]);
});

test("editing code the node doesn't explain passes", () => {
  const readFile: ReadFile = () => "one\ntwo\nthree\nFOUR\nfive\n";
  expect(check(graph, readFile)).toEqual([]);
});
