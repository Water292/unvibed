import { expect, test } from "vitest";
import { parseDiff } from "react-diff-view";
import { hunkIn } from "../src/hunks.ts";

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
const changes = parseDiff(diff)[0]!.hunks.flatMap((h) => h.changes);
const texts = (side: "LEFT" | "RIGHT", start: number, end: number) => hunkIn(changes, side, start, end).changes.map((c) => c.content);

test("a head range shows the lines it replaced", () => {
  expect(texts("RIGHT", 2, 2)).toEqual(["b", "B"]);
});

test("a base range shows what replaced it, but not what was added after it", () => {
  expect(texts("LEFT", 2, 3)).toEqual(["b", "B", "c"]);
});

test("the hunk starts at the range's first line on each side and counts each side's lines", () => {
  const h = hunkIn(changes, "RIGHT", 2, 4);
  expect([h.oldStart, h.oldLines, h.newStart, h.newLines]).toEqual([2, 2, 2, 3]);
});

// two lines replaced by three, zipped for a split view: -x +X -y +Y +Z
const zipped = parseDiff(
  `diff --git a/g b/g
--- a/g
+++ b/g
@@ -1,3 +1,4 @@
 a
-x
-y
+X
+Y
+Z`,
  { nearbySequences: "zip" },
)[0]!.hunks.flatMap((h) => h.changes);
const zippedTexts = (side: "LEFT" | "RIGHT", start: number, end: number) =>
  hunkIn(zipped, side, start, end).changes.map((c) => c.content);

test("zipped, a head range keeps each added line's partner", () => {
  expect(zippedTexts("RIGHT", 2, 4)).toEqual(["x", "X", "y", "Y", "Z"]);
});

test("zipped, a head range starting mid-block starts with that line's partner", () => {
  expect(zippedTexts("RIGHT", 3, 3)).toEqual(["y", "Y"]);
});
