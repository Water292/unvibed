// /code: which places in a file it shows as one box, and which it keeps apart.
import { expect, test } from "@playwright/test";
import type { CodeAnswer } from "../shared/graph-and-code.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { startViewer } from "./start-viewer.ts";

// changed.txt: line 5 "five" is replaced by two lines, "5" and "6"; the rest is lines 1-4 and 7-12, unchanged.
const BEFORE = ["1", "2", "3", "4", "five", "7", "8", "9", "10", "11", "12"].join("\n") + "\n";
const AFTER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].join("\n") + "\n";
// same.txt: 20 lines, unchanged.
const SAME = Array.from({ length: 20 }, (_, i) => `${i + 1}`).join("\n") + "\n";

let viewer: Awaited<ReturnType<typeof startViewer>>;
test.beforeAll(async ({}, { parallelIndex }) => {
  const { dir, git, write } = tempRepo();
  write("changed.txt", BEFORE);
  write("same.txt", SAME);
  git("add", ".");
  git("commit", "-qm", "before");
  write("changed.txt", AFTER);
  git("commit", "-qam", "after");
  write("graph.json", JSON.stringify({ schema: "test", nodes: [], edges: [] }));
  viewer = await startViewer(dir, 4760 + parallelIndex, ["--base", "HEAD~1", "--head", "HEAD"]);
});
test.afterAll(() => viewer.stop());

/** Asks /code for places in path, each written side,start,end,above,below. */
async function code(path: string, ...places: string[]): Promise<CodeAnswer> {
  const q = new URLSearchParams({ path });
  for (const place of places) q.append("at", place);
  return (await fetch(`${viewer.url}code?${q}`)).json();
}

/** Each box as the places it shows, by their place in the request, and the first and last line it shows after the change. */
const boxes = (answer: CodeAnswer) => answer.boxes.map(({ items, from, to }) => ({ items, from: from.RIGHT, to: to.RIGHT }));

test("places whose lines overlap are one box", async () => {
  // line 7 shows 7-10 (its unchanged lines stop at the change just above it), line 12 shows 9-12
  expect(boxes(await code("changed.txt", "RIGHT,7,7,0,0", "RIGHT,12,12,0,0"))).toEqual([{ items: [0, 1], from: 7, to: 12 }]);
});

test("places whose lines sit right next to each other are one box; one hidden line between them keeps them apart", async () => {
  // line 5 shows 2-8 and line 12 shows 9-15: nothing between them
  expect(boxes(await code("same.txt", "RIGHT,5,5,0,0", "RIGHT,12,12,0,0"))).toEqual([{ items: [0, 1], from: 2, to: 15 }]);
  // line 13 shows 10-16: line 9 is between them
  expect(boxes(await code("same.txt", "RIGHT,5,5,0,0", "RIGHT,13,13,0,0")).map((b) => b.items)).toEqual([[0], [1]]);
});

test("a change neither place shows keeps them apart, however close their line numbers; ↓ into it joins them", async () => {
  // line 4 shows 1-4 and line 8 shows 7-11: the change between them is hidden
  expect(boxes(await code("changed.txt", "RIGHT,4,4,0,0", "RIGHT,8,8,0,0"))).toEqual([
    { items: [0], from: 1, to: 4 },
    { items: [1], from: 7, to: 11 },
  ]);
  // one line of ↓ on line 4 reaches into the change, so it shows all of it, and the two meet
  expect(boxes(await code("changed.txt", "RIGHT,4,4,0,1", "RIGHT,8,8,0,0"))).toEqual([{ items: [0, 1], from: 1, to: 11 }]);
});

test("a place before the change and a place after it are one box when their lines meet", async () => {
  // "five", as it was, shows lines 2-5 from before; "5" and "6", what replaced it, show from line 2 with it
  const answer = await code("changed.txt", "LEFT,5,5,0,0", "RIGHT,5,6,0,0");
  expect(answer.boxes.map(({ items, from, to }) => ({ items, from, to }))).toEqual([
    { items: [0, 1], from: { LEFT: 2, RIGHT: 2 }, to: { LEFT: 8, RIGHT: 9 } },
  ]);
  // line 8 after the change shows 7-11: "5" and "6" between them are shown by neither
  expect(boxes(await code("changed.txt", "LEFT,5,5,0,0", "RIGHT,8,8,0,0")).map((b) => b.items)).toEqual([[0], [1]]);
});

test("boxes come in the order their lines come in the file, whatever order they were asked in; a place not in the file is last", async () => {
  expect(boxes(await code("changed.txt", "RIGHT,40,40,0,0", "RIGHT,8,8,0,0", "RIGHT,4,4,0,0")).map((b) => b.items)).toEqual([[2], [1], [0]]);
});
