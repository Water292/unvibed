import { expect, test } from "vitest";
import { boxesIn, diffText, gitdiff, hunkIn } from "../src/hunks.ts";

// line 2 "b" was replaced by "B", and "d" was added after "c"
const diff = `diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,3 +1,4 @@
 a
-b
+B
 c
+d`;
const changes = gitdiff.parse(diff)[0]!.hunks.flatMap((h) => h.changes);
const texts = (side: "LEFT" | "RIGHT", start: number, end: number) => hunkIn(changes, side, start, end).map((c) => c.content);

test("a head range shows the lines it replaced, with the unchanged lines around them", () => {
  expect(texts("RIGHT", 2, 2)).toEqual(["a", "b", "B", "c"]);
});

test("a base range shows what replaced it; surrounding lines stop at a change outside the range", () => {
  // "d" was added after "c", outside the base range, so it isn't kept as context
  expect(texts("LEFT", 2, 3)).toEqual(["a", "b", "B", "c"]);
});

test("the diff text's @@ line starts at the first line shown on each side and counts each side's lines", () => {
  expect(diffText("f", hunkIn(changes, "RIGHT", 2, 4)).split("\n")[3]).toBe("@@ -1,3 +1,4 @@");
});

test("cut changes as diff text read back as the same lines, with the same line numbers on each side", () => {
  const cut = hunkIn(changes, "RIGHT", 2, 4);
  const back = gitdiff.parse(diffText("f", cut))[0]!.hunks.flatMap((h) => h.changes);
  expect(back).toEqual(cut);
});

// 12 lines on the head side: unchanged 1-4, "five" replaced by two lines (5-6), unchanged 7-12
const longer = gitdiff.parse(`diff --git a/g b/g
--- a/g
+++ b/g
@@ -1,11 +1,12 @@
 1
 2
 3
 4
-five
+5
+6
 7
 8
 9
 10
 11
 12`)[0]!.hunks.flatMap((h) => h.changes);
const widened = (start: number, end: number, above: number, below: number) =>
  hunkIn(longer, "RIGHT", start, end, above, below).map((c) => c.content);

test("widening adds lines on its side, with unchanged lines around them as usual", () => {
  expect(widened(10, 10, 0, 1)).toEqual(["7", "8", "9", "10", "11", "12"]);
  expect(widened(11, 11, 1, 0)).toEqual(["7", "8", "9", "10", "11", "12"]);
});

test("a widened edge that lands inside a change goes on to the end of the change", () => {
  // up from 9 by 3 reaches 6, inside the change: the cut runs on up through 5 and the replaced line
  expect(widened(9, 9, 3, 0)).toEqual(["2", "3", "4", "five", "5", "6", "7", "8", "9", "10", "11", "12"]);
  // down from 1 by 4 reaches 5, inside the change: the cut runs on to 6, then 3 unchanged lines
  expect(widened(1, 1, 0, 4)).toEqual(["1", "2", "3", "4", "five", "5", "6", "7", "8", "9"]);
});

test("a location's own edges don't take in a change next to them", () => {
  // line 4 sits just above the change; its unchanged lines stop there
  expect(widened(4, 4, 0, 0)).toEqual(["1", "2", "3", "4"]);
});

const at = (start: number, end: number, above = 0, below = 0) => ({ start, end, above, below });
const boxes = (...ats: ReturnType<typeof at>[]) => boxesIn("g", longer, "RIGHT", ats).map(({ items, from, to }) => ({ items, from, to }));

// 20 unchanged lines
const plain = gitdiff.parse(
  ["diff --git a/p b/p", "--- a/p", "+++ b/p", "@@ -1,20 +1,20 @@", ...Array.from({ length: 20 }, (_, i) => ` ${i + 1}`)].join("\n"),
)[0]!.hunks.flatMap((h) => h.changes);

test("locations whose rows overlap or touch are one box, from the first line any shows to the last", () => {
  // 7 shows 7..10 (its unchanged lines stop at the change above it), 12 shows 9..12
  expect(boxes(at(7, 7), at(12, 12))).toEqual([{ items: [0, 1], from: 7, to: 12 }]);
  const plainBoxes = (...ats: ReturnType<typeof at>[]) => boxesIn("p", plain, "RIGHT", ats).map(({ items, from, to }) => ({ items, from, to }));
  // 5 shows 2..8, 12 shows 9..15: nothing between them
  expect(plainBoxes(at(5, 5), at(12, 12))).toEqual([{ items: [0, 1], from: 2, to: 15 }]);
  // 13 shows 10..16: line 9 is between them
  expect(plainBoxes(at(5, 5), at(13, 13)).map((b) => b.items)).toEqual([[0], [1]]);
});

test("a change neither location shows keeps them two boxes, however few lines apart they are", () => {
  // 4 shows 1..4 and 8 shows 7..11: the change between them (five, 5, 6) is hidden
  expect(boxes(at(4, 4), at(8, 8))).toEqual([
    { items: [0], from: 1, to: 4 },
    { items: [1], from: 7, to: 11 },
  ]);
  // ↓ on 4 reaches into the change, so it shows all of it, and the two meet
  expect(boxes(at(4, 4, 0, 1), at(8, 8))).toEqual([{ items: [0, 1], from: 1, to: 11 }]);
});

test("boxes come in the order their rows start, whatever the request's order; a location with no rows is last", () => {
  expect(boxesIn("g", longer, "RIGHT", [at(40, 40), at(8, 8), at(4, 4)]).map((b) => b.items)).toEqual([[2], [1], [0]]);
});

test("no changes, a file that can't be read, is empty text", () => {
  expect(diffText("f", hunkIn([], "RIGHT", 1, 3))).toBe("");
});
