import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { checkThreads, type ReadFile } from "../src/check.ts";
import { place, placeInGraph, type GraphAnchor } from "../src/place.ts";
import type { Graph } from "../shared/graph.ts";
import type { Anchor, Thread } from "../shared/thread.ts";

// A node with one location, and an edge from it to itself.
const nodeId = randomUUID();
const edgeId = randomUUID();
const locationId = randomUUID();
const graph: Graph = {
  schema: "test",
  nodes: [
    {
      id: nodeId,
      title: "Marks hold while code only moves",
      text: "A mark is made by the hash of the lines.",
      code: [{ id: locationId, path: "f.ts", side: "RIGHT", start_line: 2, line: 3, hash: "", added: 0, removed: 0, text: "The hash leaves out line numbers." }],
    },
  ],
  edges: [{ id: edgeId, from: nodeId, to: nodeId, note: "explains" }],
};
const files: ReadFile = (side, path) => (path !== "f.ts" ? undefined : side === "LEFT" ? "one\nzwei\n" : "one\ntwo\nthree\n");

/** A range holding quote, where it is in text. */
const at = (text: string, quote: string) => ({ start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote });

const thread = (anchor: Anchor, dropped: Thread["dropped"] = null): Thread => ({
  id: randomUUID(),
  review: "pr",
  anchor,
  base: "b",
  head: null,
  sessionId: null,
  createdAt: 0,
  dropped,
});

test("a range is in place only when the characters there are exactly its quote", () => {
  expect(place({ start: 2, end: 5, quote: "cde" }, "abcdefg")).toEqual({ ok: true });
  expect(place({ start: 2, end: 5, quote: "CDE" }, "abcdefg")).toEqual({ ok: false, reason: "quote-mismatch", now: "cde" });
  expect(place({ start: 2, end: 5, quote: "cd" }, "abcdefg")).toEqual({ ok: false, reason: "quote-mismatch", now: "cde" });
  expect(place({ start: 0, end: 0, quote: "" }, "")).toEqual({ ok: true });
});

test("a range past the end of its text is out of range, showing what is still there", () => {
  expect(place({ start: 4, end: 9, quote: "efghi" }, "abcdefg")).toEqual({ ok: false, reason: "out-of-range", now: "efg" });
  expect(place({ start: 5, end: 3, quote: "" }, "abcdefg")).toMatchObject({ ok: false, reason: "out-of-range" });
});

test("every kind of graph anchor is in place on the text it names", () => {
  const n = graph.nodes[0]!;
  const anchors: GraphAnchor[] = [
    { in: "node-title", nodeId, ...at(n.title, "code only moves") },
    { in: "node-text", nodeId, ...at(n.text, "hash") },
    { in: "edge-note", edgeId, ...at("explains", "plain") },
    { in: "location-text", locationId, ...at(n.code[0]!.text, "line numbers") },
    // lines 2-3 joined: "two\nthree"
    { in: "code", path: "f.ts", side: "RIGHT", startLine: 2, endLine: 3, start: 2, end: 6, quote: "o\nth" },
    { in: "code", path: "f.ts", side: "LEFT", startLine: 2, endLine: 2, start: 0, end: 4, quote: "zwei" },
  ];
  for (const anchor of anchors) expect(placeInGraph(anchor, graph, files), anchor.in).toEqual({ ok: true });
});

test("an anchor on something the graph no longer has is missing", () => {
  const range = { start: 0, end: 1, quote: "M" };
  expect(placeInGraph({ in: "node-title", nodeId: randomUUID(), ...range }, graph, files)).toEqual({ ok: false, reason: "missing-node" });
  expect(placeInGraph({ in: "edge-note", edgeId: randomUUID(), ...range }, graph, files)).toEqual({ ok: false, reason: "missing-edge" });
  expect(placeInGraph({ in: "location-text", locationId: randomUUID(), ...range }, graph, files)).toEqual({ ok: false, reason: "missing-location" });
  expect(placeInGraph({ in: "code", path: "gone.ts", side: "RIGHT", startLine: 1, endLine: 1, ...range }, graph, files)).toEqual({ ok: false, reason: "missing-file" });
});

test("an edge with no note has empty text, so only an empty quote at 0 is in place on it", () => {
  const noNote: Graph = { ...graph, edges: [{ id: edgeId, from: nodeId, to: nodeId }] };
  expect(placeInGraph({ in: "edge-note", edgeId, start: 0, end: 0, quote: "" }, noNote, files)).toEqual({ ok: true });
  expect(placeInGraph({ in: "edge-note", edgeId, start: 0, end: 4, quote: "expl" }, noNote, files)).toEqual({ ok: false, reason: "out-of-range", now: "" });
});

test("code lines past the end of the file are out of range, though the offsets fit the lines still there", () => {
  const anchor: GraphAnchor = { in: "code", path: "f.ts", side: "RIGHT", startLine: 3, endLine: 4, start: 0, end: 3, quote: "thr" };
  expect(placeInGraph(anchor, graph, files)).toEqual({ ok: false, reason: "out-of-range", now: "thr" });
});

test("code that changed under a code anchor is a quote mismatch, showing what is there now", () => {
  const anchor: GraphAnchor = { in: "code", path: "f.ts", side: "RIGHT", startLine: 2, endLine: 2, start: 0, end: 3, quote: "two" };
  const edited: ReadFile = () => "one\nTWO\nthree\n";
  expect(placeInGraph(anchor, graph, edited)).toEqual({ ok: false, reason: "quote-mismatch", now: "TWO" });
});

test("check reports threads out of place, and leaves dropped ones and ones in other threads alone", () => {
  const misplaced = thread({ in: "node-text", nodeId, start: 0, end: 4, quote: "Some" });
  const dropped = thread({ in: "node-text", nodeId, start: 0, end: 4, quote: "Some" }, { reason: "the text it asked about is gone", at: 1 });
  const inPlace = thread({ in: "node-text", nodeId, start: 0, end: 6, quote: "A mark" });
  // nothing about these is checked: the other threads may not even exist
  const inMessage = thread({ in: "message", threadId: randomUUID(), seq: 9, start: 0, end: 4, quote: "Some" });
  const inSummary = thread({ in: "summary", threadId: randomUUID(), start: 0, end: 4, quote: "Some" });
  expect(checkThreads([misplaced, dropped, inPlace, inMessage, inSummary], graph, files)).toEqual([{ thread: misplaced, reason: "quote-mismatch", now: "A ma" }]);
});

test("a rewritten graph fails the threads on what it dropped or reworded", () => {
  const onTitle = thread({ in: "node-title", nodeId, ...at(graph.nodes[0]!.title, "code only moves") });
  const onLocation = thread({ in: "location-text", locationId, ...at(graph.nodes[0]!.code[0]!.text, "line numbers") });
  const rewritten: Graph = { ...graph, nodes: [{ ...graph.nodes[0]!, title: "Marks survive moves", code: [] }] };
  expect(checkThreads([onTitle, onLocation], rewritten, files)).toEqual([
    { thread: onTitle, reason: "out-of-range", now: "es" },
    { thread: onLocation, reason: "missing-location", now: undefined },
  ]);
});
