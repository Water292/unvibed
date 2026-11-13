import { expect, test } from "vitest";
import { diffText, gitdiff, hunkIn } from "../src/hunks.ts";

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

test("no changes, a file that can't be read, is empty text", () => {
  expect(diffText("f", hunkIn([], "RIGHT", 1, 3))).toBe("");
});
