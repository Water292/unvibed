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

test("a head range shows the lines it replaced", () => {
  expect(texts("RIGHT", 2, 2)).toEqual(["b", "B"]);
});

test("a base range shows what replaced it, but not what was added after it", () => {
  expect(texts("LEFT", 2, 3)).toEqual(["b", "B", "c"]);
});

test("the diff text's @@ line starts at the range's first line on each side and counts each side's lines", () => {
  expect(diffText("f", hunkIn(changes, "RIGHT", 2, 4)).split("\n")[3]).toBe("@@ -2,2 +2,3 @@");
});

test("cut changes as diff text read back as the same lines, with the same line numbers on each side", () => {
  const cut = hunkIn(changes, "RIGHT", 2, 4);
  const back = gitdiff.parse(diffText("f", cut))[0]!.hunks.flatMap((h) => h.changes);
  expect(back).toEqual(cut);
});

test("no changes, a file that can't be read, is empty text", () => {
  expect(diffText("f", hunkIn([], "RIGHT", 1, 3))).toBe("");
});
