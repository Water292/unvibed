import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { check, type ReadFile } from "../src/check.ts";
import { hashLines } from "../src/hunks.ts";
import type { Graph } from "../shared/graph.ts";

// One node explaining lines 2\u20133 of a file: "two" replaced "zwei", "three" didn't change.
const graph: Graph = {
  schema: "test",
  nodes: [
    {
      id: "n",
      title: "t",
      text: "",
      code: [{ path: "example.ts", side: "RIGHT", start_line: 2, line: 3, hash: hashLines(["-zwei", "+two", " three"]), added: 1, removed: 1 }],
    },
  ],
  edges: [],
};

const sides = (base: string, head: string): ReadFile => (side) => (side === "LEFT" ? base : head);
const BASE = "one\nzwei\nthree\nfour\n";
const HEAD = "one\ntwo\nthree\nfour\n";

test("the hash is git's blob hash of the lines", () => {
  const lines = ["// na\u00efve \u2192 caf\u00e9", "\ud83e\udd16"];
  const git = execFileSync("git", ["hash-object", "--stdin"], { input: lines.join("\n") }).toString().trim();
  expect(hashLines(lines)).toBe(git);
});

test("untouched code passes", () => {
  expect(check(graph, sides(BASE, HEAD))).toEqual([]);
});

test("editing a line the node explains fails, showing the rows now", () => {
  expect(check(graph, sides(BASE, "one\nTWO\nthree\nfour\n"))).toMatchObject([{ reason: "hash-mismatch", actual: ["-zwei", "+TWO", " three"] }]);
});

test("code shifting under the node fails", () => {
  expect(check(graph, sides(BASE, `zero\n${HEAD}`))).toMatchObject([{ reason: "hash-mismatch" }]);
});

test("the same head lines replacing something else fail: a base change changes the change", () => {
  expect(check(graph, sides("one\ndeux\nthree\nfour\n", HEAD))).toMatchObject([{ reason: "hash-mismatch", actual: ["-deux", "+two", " three"] }]);
});

test("editing code the node doesn't explain passes", () => {
  expect(check(graph, sides(BASE, "one\ntwo\nthree\nFOUR\nfive\n"))).toEqual([]);
});

test("counts that don't match the rows fail, even with the right hash", () => {
  const location = { ...graph.nodes[0]!.code[0]!, added: 5 };
  const wrong = { ...graph, nodes: [{ ...graph.nodes[0]!, code: [location] }] };
  expect(check(wrong, sides(BASE, HEAD))).toMatchObject([{ reason: "count-mismatch" }]);
});

test("a location past the end of its file, or in a file that isn't there, fails", () => {
  expect(check(graph, sides(BASE, "one\n"))).toMatchObject([{ reason: "out-of-range" }]);
  expect(check(graph, () => undefined)).toMatchObject([{ reason: "missing-file" }]);
});
