// /code: which places in a file it shows as one box, and which it keeps apart.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { CodeAnswer, RequestedLocation } from "../shared/graph-and-code.ts";
import type { Location } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { askCode } from "./ask-code.ts";
import { startViewer } from "./start-viewer.ts";

// changed.txt: line 5 "five" is replaced by two lines, "5" and "6"; the rest is lines 1-4 and 7-12, unchanged.
const BEFORE = ["1", "2", "3", "4", "five", "7", "8", "9", "10", "11", "12"].join("\n") + "\n";
const AFTER = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].join("\n") + "\n";
// same.txt: 20 lines, unchanged.
const SAME = Array.from({ length: 20 }, (_, i) => `${i + 1}`).join("\n") + "\n";

/** Makes a location on lines firstLine to lastLine of path, in the version side names. Boxes don't read its hash. */
function createLocation(path: string, side: Location["side"], firstLine: number, lastLine: number): Location {
  return { id: randomUUID(), path, side, start_line: firstLine, line: lastLine, hash: "", added: 0, removed: 0, text: "" };
}

// Line numbers count after the change unless the name says before.
const CHANGED_TXT_LINE_4 = createLocation("changed.txt", "RIGHT", 4, 4);
const CHANGED_TXT_LINES_5_TO_6 = createLocation("changed.txt", "RIGHT", 5, 6);
const CHANGED_TXT_LINE_5_BEFORE = createLocation("changed.txt", "LEFT", 5, 5);
const CHANGED_TXT_LINE_7 = createLocation("changed.txt", "RIGHT", 7, 7);
const CHANGED_TXT_LINE_8 = createLocation("changed.txt", "RIGHT", 8, 8);
const CHANGED_TXT_LINE_12 = createLocation("changed.txt", "RIGHT", 12, 12);
const CHANGED_TXT_LINE_40 = createLocation("changed.txt", "RIGHT", 40, 40); // past the end of the file
const SAME_TXT_LINE_5 = createLocation("same.txt", "RIGHT", 5, 5);
const SAME_TXT_LINE_12 = createLocation("same.txt", "RIGHT", 12, 12);
const SAME_TXT_LINE_13 = createLocation("same.txt", "RIGHT", 13, 13);

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
  // The places go in once the viewer is up: it checks graph.json against the code when it starts, and a checked graph
  // can't hold a line past the end of a file. It reads the graph again for every request.
  const code = [
    CHANGED_TXT_LINE_4,
    CHANGED_TXT_LINES_5_TO_6,
    CHANGED_TXT_LINE_5_BEFORE,
    CHANGED_TXT_LINE_7,
    CHANGED_TXT_LINE_8,
    CHANGED_TXT_LINE_12,
    CHANGED_TXT_LINE_40,
    SAME_TXT_LINE_5,
    SAME_TXT_LINE_12,
    SAME_TXT_LINE_13,
  ];
  write("graph.json", JSON.stringify({ schema: "test", nodes: [{ id: randomUUID(), title: "", text: "", code }], edges: [] }));
});
test.afterAll(() => viewer.stop());

/** Asks /code for locations, each as widened as given. */
async function code(locations: RequestedLocation[]): Promise<CodeAnswer> {
  return (await askCode(viewer.url, { locations })).json();
}

/** Asks /code for locations, none of them widened. */
const codeNotWidened = (...locations: Location[]) => code(locations.map((location) => ({ id: location.id, above: 0, below: 0 })));

/** Each box as the places it shows, by their place in the request, and the first and last line it shows after the change. */
const boxes = (answer: CodeAnswer) => answer.boxes.map(({ items, from, to }) => ({ items, from: from.RIGHT, to: to.RIGHT }));

test("places whose lines overlap are one box", async () => {
  // line 7 shows 7-10 (its unchanged lines stop at the change just above it), line 12 shows 9-12
  expect(boxes(await codeNotWidened(CHANGED_TXT_LINE_7, CHANGED_TXT_LINE_12))).toEqual([{ items: [0, 1], from: 7, to: 12 }]);
});

test("places whose lines sit right next to each other are one box; one hidden line between them keeps them apart", async () => {
  // line 5 shows 2-8 and line 12 shows 9-15: nothing between them
  expect(boxes(await codeNotWidened(SAME_TXT_LINE_5, SAME_TXT_LINE_12))).toEqual([{ items: [0, 1], from: 2, to: 15 }]);
  // line 13 shows 10-16: line 9 is between them
  expect(boxes(await codeNotWidened(SAME_TXT_LINE_5, SAME_TXT_LINE_13)).map((b) => b.items)).toEqual([[0], [1]]);
});

test("a change neither place shows keeps them apart, however close their line numbers; ↓ into it joins them", async () => {
  // line 4 shows 1-4 and line 8 shows 7-11: the change between them is hidden
  expect(boxes(await codeNotWidened(CHANGED_TXT_LINE_4, CHANGED_TXT_LINE_8))).toEqual([
    { items: [0], from: 1, to: 4 },
    { items: [1], from: 7, to: 11 },
  ]);
  // one line of ↓ on line 4 reaches into the change, so it shows all of it, and the two meet
  const widened = await code([
    { id: CHANGED_TXT_LINE_4.id, above: 0, below: 1 },
    { id: CHANGED_TXT_LINE_8.id, above: 0, below: 0 },
  ]);
  expect(boxes(widened)).toEqual([{ items: [0, 1], from: 1, to: 11 }]);
});

test("a place before the change and a place after it are one box when their lines meet", async () => {
  // "five", as it was, shows lines 2-5 from before; "5" and "6", what replaced it, show from line 2 with it
  const answer = await codeNotWidened(CHANGED_TXT_LINE_5_BEFORE, CHANGED_TXT_LINES_5_TO_6);
  expect(answer.boxes.map(({ items, from, to }) => ({ items, from, to }))).toEqual([
    { items: [0, 1], from: { LEFT: 2, RIGHT: 2 }, to: { LEFT: 8, RIGHT: 9 } },
  ]);
  // line 8 after the change shows 7-11: "5" and "6" between them are shown by neither
  expect(boxes(await codeNotWidened(CHANGED_TXT_LINE_5_BEFORE, CHANGED_TXT_LINE_8)).map((b) => b.items)).toEqual([[0], [1]]);
});

test("boxes come in the order their lines come in the file, whatever order they were asked in; a place not in the file is last", async () => {
  expect(boxes(await codeNotWidened(CHANGED_TXT_LINE_40, CHANGED_TXT_LINE_8, CHANGED_TXT_LINE_4)).map((b) => b.items)).toEqual([[2], [1], [0]]);
});
