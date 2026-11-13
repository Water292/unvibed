// A node's locations in one file, each with its explanation, run into one box as ↓ widens the first to the second.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Graph, Location } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { hashLines } from "../src/hunks.ts";
import { startViewer } from "./start-viewer.ts";

// long.txt: 60 lines; the head changes line 5 and line 40.
const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
const BASE = lines.join("\n") + "\n";
const HEAD = BASE.replace("line 5\n", "LINE FIVE\n").replace("line 40\n", "LINE FORTY\n");

// The places the nodes point at. Each is a function because every location in a graph needs its own id, so a node
// gets its own copy. A location's hash is of its own rows: each line removed, marked -, then each line added, marked +.

/** Line 5 after the change. */
const five = (): Location => ({
  id: randomUUID(),
  path: "long.txt",
  side: "RIGHT",
  line: 5,
  hash: hashLines(["-line 5", "+LINE FIVE"]),
  added: 1,
  removed: 1,
  text: "Five, shouted.",
});

/** Line 40 after the change. */
const forty = (): Location => ({
  id: randomUUID(),
  path: "long.txt",
  side: "RIGHT",
  line: 40,
  hash: hashLines(["-line 40", "+LINE FORTY"]),
  added: 1,
  removed: 1,
  text: "Forty, shouted.",
});

/** Line 40 before the change: the line the change removed. */
const oldForty = (): Location => ({
  id: randomUUID(),
  path: "long.txt",
  side: "LEFT",
  line: 40,
  hash: hashLines(["-line 40"]),
  added: 0,
  removed: 1,
  text: "The old forty, gone.",
});

/** Line 1 of short.txt after the change. */
const shortA = (): Location => ({
  id: randomUUID(),
  path: "short.txt",
  side: "RIGHT",
  line: 1,
  hash: hashLines(["-a", "+A"]),
  added: 1,
  removed: 1,
  text: "A, shouted.",
});

const NODE_UUID = randomUUID();
const BOTH_SIDES_UUID = randomUUID();
const TWO_FILES_UUID = randomUUID();
const graph: Graph = {
  schema: "test",
  nodes: [
    // listed last line first: the panel shows them in the file's order
    { id: NODE_UUID, title: "two changes", text: "", code: [forty(), five()] },
    { id: BOTH_SIDES_UUID, title: "a change, and a line it removed", text: "", code: [five(), oldForty()] },
    { id: TWO_FILES_UUID, title: "a change in each of two files", text: "", code: [five(), shortA()] },
  ],
  edges: [],
};

let viewer: Awaited<ReturnType<typeof startViewer>>;
test.beforeAll(async ({}, { parallelIndex }) => {
  const { dir, git, write } = tempRepo();
  write("long.txt", BASE);
  write("short.txt", "a\n");
  git("add", ".");
  git("commit", "-qm", "base");
  write("long.txt", HEAD);
  write("short.txt", "A\n");
  git("commit", "-qam", "head");
  write("graph.json", JSON.stringify(graph));
  viewer = await startViewer(dir, 4750 + parallelIndex, ["--base", "HEAD~1", "--head", "HEAD"]);
});
test.afterAll(() => viewer.stop());

test("each location's explanation is above its lines; ↓ runs the two into one box, each keeping its own reviewed box", async ({ page }) => {
  await page.goto(viewer.url);
  await page.locator(`.react-flow__node[data-id="${NODE_UUID}"]`).click();
  const panel = page.locator("aside");
  const boxes = panel.locator(".code-view");
  const reviewed = panel.getByRole("checkbox", { name: "reviewed" });

  // Two boxes, in the file's order, each under its place and explanation.
  await expect(boxes).toHaveCount(2);
  await expect(panel.getByText("long.txt:5 (head)")).toBeVisible();
  await expect(panel.getByText("Five, shouted.")).toBeVisible();
  await expect(boxes.nth(0)).toContainText("LINE FIVE");
  await expect(boxes.nth(1)).toContainText("LINE FORTY");
  await expect(panel.getByText("Forty, shouted.")).toBeVisible();
  const top = async (text: string) => (await panel.getByText(text).boundingBox())!.y;
  expect(await top("Five, shouted.")).toBeLessThan(await top("Forty, shouted."));

  // ↓ once: line 5's box showed to line 8, and now shows 20 lines past that and the unchanged lines after, to 31;
  // line 40's shows from 37, so line 32 to 36 are between them: still two boxes.
  await boxes.nth(0).getByRole("button", { name: "↓" }).click();
  await expect(boxes.nth(0)).toContainText("line 31");
  await expect(boxes).toHaveCount(2);

  // ↓ again: line 5's lines reach past where line 40's start, so the two are one box: line 40's header sits inside
  // it, under line 39, and the box shows as far as line 5's ↓ reached, line 54.
  await boxes.nth(0).getByRole("button", { name: "↓" }).click();
  await expect(boxes).toHaveCount(1);
  const inline = boxes.locator(".code-view-inline");
  await expect(inline).toContainText("long.txt:40 (head)");
  await expect(inline).toContainText("Forty, shouted.");
  await expect(inline.locator("xpath=ancestor::tr/preceding-sibling::tr[1]")).toContainText("line 39");
  await expect(boxes).toContainText("line 54");
  await expect(boxes.getByText("line 55", { exact: true })).toHaveCount(0);

  // Each location is still ticked on its own.
  await expect(reviewed).toHaveCount(2);
  await reviewed.nth(1).click();
  await expect(reviewed.nth(1)).toBeChecked();
  await expect(reviewed.nth(0)).not.toBeChecked();

  // ↓ on the one box goes on from where it reaches.
  await boxes.getByRole("button", { name: "↓" }).click();
  await expect(boxes).toContainText("line 60");

  // Split view draws line 40's header once, on the head side.
  await page.getByRole("button", { name: "Split" }).click();
  await expect(boxes.locator(".code-view-inline")).toHaveCount(1);
  await expect(reviewed).toHaveCount(2);
});

test("a line from before the change and one from after are one box once their lines meet, the later header shown once", async ({ page }) => {
  await page.goto(viewer.url);
  await page.locator(`.react-flow__node[data-id="${BOTH_SIDES_UUID}"]`).click();
  const panel = page.locator("aside");
  const boxes = panel.locator(".code-view");
  await expect(boxes).toHaveCount(2);
  await expect(panel.getByText("long.txt:40 (base)")).toBeVisible();

  await boxes.nth(0).getByRole("button", { name: "↓" }).click();
  await boxes.nth(0).getByRole("button", { name: "↓" }).click();
  await expect(boxes).toHaveCount(1);
  // the removed line's header sits inside the box once, under line 39, in unified view and in split view
  const inline = boxes.locator(".code-view-inline");
  await expect(inline).toHaveCount(1);
  await expect(inline).toContainText("The old forty, gone.");
  await expect(inline.locator("xpath=ancestor::tr/preceding-sibling::tr[1]")).toContainText("line 39");
  await page.getByRole("button", { name: "Split" }).click();
  await expect(boxes.locator(".code-view-inline")).toHaveCount(1);
  await expect(panel.getByRole("checkbox", { name: "reviewed" })).toHaveCount(2);
});

test("places in two files are two boxes, each under its own file", async ({ page }) => {
  await page.goto(viewer.url);
  await page.locator(`.react-flow__node[data-id="${TWO_FILES_UUID}"]`).click();
  const panel = page.locator("aside");
  const boxes = panel.locator(".code-view");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).toContainText("LINE FIVE");
  await expect(boxes.nth(1)).toContainText("A");
  await expect(panel.getByText("short.txt:1 (head)")).toBeVisible();
});
