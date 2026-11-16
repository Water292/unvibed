import { expect, test } from "vitest";
import { splitDiff } from "../src/code-view.tsx";

const header = (piece: string) => piece.split("\n").find((l) => l.startsWith("@@"));

// git writes a side with no lines as the line before the change: 0 for a new file, 10 for lines added after line 10
test("a side with no lines keeps git's start: 0 for a new file", () => {
  const diff = "@@ -0,0 +1,3 @@\n+a\n+b\n+c\n";
  expect(splitDiff(diff, "RIGHT", []).map(header)).toEqual(["@@ -0,0 +1,3 @@"]);
});

test("a side with no lines keeps git's start: the line the others were added after", () => {
  const diff = "@@ -10,0 +11,2 @@\n+a\n+b\n";
  expect(splitDiff(diff, "RIGHT", []).map(header)).toEqual(["@@ -10,0 +11,2 @@"]);
});

test("a new file cut in two keeps 0 as the old side's start in both pieces", () => {
  const diff = "@@ -0,0 +1,4 @@\n+a\n+b\n+c\n+d\n";
  expect(splitDiff(diff, "RIGHT", [3]).map(header)).toEqual(["@@ -0,0 +1,2 @@", "@@ -0,0 +3,2 @@"]);
});

test("a cut of changed lines numbers both sides from where each piece starts", () => {
  const diff = "@@ -5,3 +5,3 @@\n a\n-b\n+B\n c\n";
  expect(splitDiff(diff, "RIGHT", [6]).map(header)).toEqual(["@@ -5,1 +5,1 @@", "@@ -6,2 +6,2 @@"]);
});
