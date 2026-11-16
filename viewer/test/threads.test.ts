import { expect, test } from "vitest";
import { isHere, quoteStart, type ThreadItem } from "../src/threads.tsx";

const item = (at: ThreadItem["at"], quote = "q", offsets?: ThreadItem["offsets"]): ThreadItem => ({ id: "t", at, quote, offsets, open: true });
const code = (side: "LEFT" | "RIGHT", start: number) => ({ code: { path: "a.ts", side, start, end: start + 1 } });
// a box of a.ts showing head lines 10 to 12
const box = { path: "a.ts", shows: (side: "LEFT" | "RIGHT", line: number) => side === "RIGHT" && line >= 10 && line <= 12 };

test("a thread on a node's text is drawn there, not in its locations' text", () => {
  expect(isHere(item({ node: "n" }), { node: "n" }, undefined)).toBe(true);
  expect(isHere(item({ node: "n" }), { node: "n", location: "l" }, undefined)).toBe(false);
  expect(isHere(item({ node: "n" }), { node: "m" }, undefined)).toBe(false);
});

test("a thread on a location's text is drawn there only", () => {
  expect(isHere(item({ node: "n", location: "l" }), { node: "n", location: "l" }, undefined)).toBe(true);
  expect(isHere(item({ node: "n", location: "l" }), { node: "n", location: "k" }, undefined)).toBe(false);
  expect(isHere(item({ node: "n", location: "l" }), { node: "n" }, undefined)).toBe(false);
});

test("a thread on code is drawn in the box of its file that shows its first line, on its side", () => {
  expect(isHere(item(code("RIGHT", 11)), undefined, box)).toBe(true);
  expect(isHere(item(code("LEFT", 11)), undefined, box)).toBe(false);
  expect(isHere(item(code("RIGHT", 13)), undefined, box)).toBe(false);
  expect(isHere(item({ code: { path: "b.ts", side: "RIGHT", start: 11, end: 11 } }), undefined, box)).toBe(false);
  // and never in text
  expect(isHere(item(code("RIGHT", 11)), { node: "n" }, undefined)).toBe(false);
});

test("a quote is placed at its offsets while the text there is still the quote, else at its first match", () => {
  const text = "one two one two";
  expect(quoteStart(text, item({ node: "n" }, "two", { start: 12, end: 15 }))).toBe(12);
  expect(quoteStart(text, item({ node: "n" }, "two", { start: 0, end: 3 }))).toBe(4); // offsets went stale
  expect(quoteStart(text, item({ node: "n" }, "two"))).toBe(4);
  expect(quoteStart(text, item({ node: "n" }, "three"))).toBeUndefined();
  expect(quoteStart(text, item({ node: "n" }, ""))).toBeUndefined();
});
