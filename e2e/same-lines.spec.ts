// Locations with the same lines share a mark: a tick reaches all of them, whichever node they're in.
import { expect, test } from "@playwright/test";
import { hashLines } from "../src/check.ts";
import type { Graph } from "../shared/graph.ts";
import { BASE_AND_WORKING_TREE, baseAndWorkingTree, serveGraphFromTempRepo } from "./serve-graph-from-temp-repo.ts";

// The same line is replaced in three places: lines 2, 5 and 8.
const BASE = "a\nold\nb\nc\nold\nd\ne\nold\nf\n";
const HEAD = BASE.replaceAll("old", "NEW");

const location = (line: number) => ({ path: "f.txt", side: "RIGHT" as const, line, hash: hashLines(["NEW"]) });
const graph: Graph = {
  schema: "test",
  nodes: [
    { id: "twins", title: "two of them", text: "", code: [location(2), location(5)] },
    { id: "other", title: "one more", text: "", code: [location(8)] },
  ],
  edges: [],
};

const served = serveGraphFromTempRepo(graph, baseAndWorkingTree("f.txt", BASE, HEAD), BASE_AND_WORKING_TREE);

test("a tick reaches every box with the same lines, in this node and others, and an untick does too", async ({ page }) => {
  const boxes = page.locator("aside").getByRole("checkbox", { name: "reviewed" });
  const open = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`).click();

  await page.goto(served.url);
  await open("twins");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();

  // Ticking one ticks its twin on screen.
  await boxes.nth(0).click();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();

  // A box in another node, fetched after the tick, is ticked too; unticking it there reaches back.
  await open("other");
  await expect(boxes).toHaveCount(1);
  await expect(boxes.nth(0)).toBeChecked();
  await boxes.nth(0).click();
  await expect(boxes.nth(0)).not.toBeChecked();

  await open("twins");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
});
