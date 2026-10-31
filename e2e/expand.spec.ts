// ↑ and ↓ on a code box, in a real browser, on a file long enough to expand into.
import { expect, test } from "@playwright/test";
import type { Graph } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { startViewer, UNSTAMPED } from "./start-viewer.ts";

// long.txt: 40 lines; the head changes line 5 and, far below, line 30.
const lines = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`);
const BASE = lines.join("\n") + "\n";
const HEAD = BASE.replace("line 5\n", "LINE FIVE\n").replace("line 30\n", "LINE THIRTY\n");

// One box, on line 5 only.
const graph: Graph = {
  schema: "test",
  nodes: [{ id: "five", title: "line five", text: "", code: [{ path: "long.txt", side: "RIGHT", line: 5, ...UNSTAMPED }] }],
  edges: [],
};

let viewer: Awaited<ReturnType<typeof startViewer>>;
test.beforeAll(async ({}, { parallelIndex }) => {
  const { dir, git, write } = tempRepo();
  write("long.txt", BASE);
  git("add", ".");
  git("commit", "-qm", "base");
  write("long.txt", HEAD);
  git("commit", "-qam", "head");
  write("graph.json", JSON.stringify(graph));
  viewer = await startViewer(dir, 4720 + parallelIndex, ["--base", "HEAD~1", "--head", "HEAD"]);
});
test.afterAll(() => viewer.stop());

test("↓ shows 20 more lines at a time, other changes as changes, until the end of the file; ↑ at the top", async ({ page }) => {
  await page.goto(viewer.url);
  await page.locator('.react-flow__node[data-id="five"]').click();
  const box = page.locator("aside .code-view");
  const up = box.getByRole("button", { name: "↑" });
  const down = box.getByRole("button", { name: "↓" });

  // At first: the location with 3 unchanged lines around it, lines 2-8, and more of the file on both sides.
  await expect(box).toContainText("LINE FIVE");
  await expect(box).toContainText("line 8");
  await expect(box).not.toContainText("line 9");
  await expect(up).toHaveCount(1);
  await expect(down).toHaveCount(1);

  // ↓ once: up to line 25 and its 3 unchanged lines; the change at line 30 isn't reached yet.
  await down.click();
  await expect(box).toContainText("line 28");
  await expect(box).not.toContainText("THIRTY");

  // ↓ again: past line 30, whose old line shows next to the new one, so it's drawn as a change; then the file
  // ends, and ↓ goes.
  await down.click();
  await expect(box).toContainText("line 40");
  await expect(box).toContainText("line 30");
  await expect(box).toContainText("LINE THIRTY");
  await expect(down).toHaveCount(0);

  // ↑ reaches the top of the file, and goes too.
  await expect(box.getByText("line 1", { exact: true })).toHaveCount(0);
  await up.click();
  await expect(box.getByText("line 1", { exact: true })).toHaveCount(1);
  await expect(up).toHaveCount(0);
});
