import { expect, test } from "vitest";
import { showsLine } from "../src/code-view.tsx";

// A box of code shows a thread on lines if it shows the thread's first line, on the thread's side.
const diff = "@@ -5,3 +5,3 @@\n a\n-b\n+B\n c\n";

test("a diff shows its context lines on both sides", () => {
  expect([showsLine(diff, "LEFT", 5), showsLine(diff, "RIGHT", 5), showsLine(diff, "LEFT", 7), showsLine(diff, "RIGHT", 7)]).toEqual([true, true, true, true]);
});

test("a deleted line is shown on the base side only, an added one on the head side only", () => {
  expect([showsLine(diff, "LEFT", 6), showsLine(diff, "RIGHT", 6)]).toEqual([true, true]); // base b, head B
  const added = "@@ -10,0 +11,2 @@\n+a\n+b\n";
  expect([showsLine(added, "RIGHT", 11), showsLine(added, "RIGHT", 12), showsLine(added, "LEFT", 10), showsLine(added, "LEFT", 11)]).toEqual([true, true, false, false]);
});

test("a line outside the diff isn't shown", () => {
  expect([showsLine(diff, "RIGHT", 4), showsLine(diff, "RIGHT", 8), showsLine("", "RIGHT", 1)]).toEqual([false, false, false]);
});
