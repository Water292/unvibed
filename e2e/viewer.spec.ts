// The viewer as a user meets it: `node src/view.ts graph.json` on a real repo, in a real browser.
import { expect, test, type Page } from "@playwright/test";
import { hashLines } from "../src/check.ts";
import { clearReview, createTables } from "../src/review.ts";
import type { Graph } from "../shared/graph.ts";
import { BASE_AND_WORKING_TREE, baseAndWorkingTree, viewerOn } from "./viewer-on.ts";

// app.ts at the base and at the head: the head replaces greet's line; add and version don't change.
const BASE = 'export function greet(name: string) {\n  return "hello " + name;\n}\n\nexport function add(a: number, b: number) {\n  return a + b;\n}\n\nexport const version = 1;\n';
const HEAD = BASE.replace('"hello "', '"hi "');

// Three boxes in a row, greet -> add -> version: greet's code changed in the PR, add's and version's didn't.
const graph: Graph = {
  schema: "test",
  nodes: [
    { id: "greet", title: "greet says hi", text: "The greeting is shorter now.", code: [{ path: "app.ts", side: "RIGHT", line: 2, hash: hashLines(['  return "hi " + name;']) }] },
    { id: "add", title: "add sums two numbers", text: "Unchanged, shown for context.", code: [{ path: "app.ts", side: "RIGHT", start_line: 5, line: 7, hash: hashLines(["export function add(a: number, b: number) {", "  return a + b;", "}"]) }] },
    { id: "version", title: "the version", text: "Still 1.", code: [{ path: "app.ts", side: "RIGHT", line: 9, hash: hashLines(["export const version = 1;"]) }] },
  ],
  edges: [
    { from: "greet", to: "add" },
    { from: "add", to: "version" },
  ],
};

// A repo with the base committed and the PR's change left uncommitted, its graph, and the viewer serving them.
const viewer = viewerOn(
  graph,
  (repo) => {
    baseAndWorkingTree("app.ts", BASE, HEAD)(repo);
    process.chdir(repo.dir); // so createTables opens this repo's database, which the viewer shares
    createTables();
  },
  BASE_AND_WORKING_TREE,
);

const box = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const link = (page: Page, from: string, to: string) => page.locator(`.react-flow__edge[data-id="${from}->${to}"] path`).first();
const panel = (page: Page) => page.locator("aside");
const handle = (page: Page) => page.getByTitle("Drag to resize");

test("read a graph: hover lights a box's neighbourhood, clicking opens its panel, links walk the graph", async ({ page }) => {
  await page.goto(viewer.url);

  // Hovering greet keeps it, its link and add lit; version fades.
  await box(page, "greet").hover();
  await expect(box(page, "greet")).toHaveCSS("opacity", "1");
  await expect(box(page, "add")).toHaveCSS("opacity", "1");
  await expect(link(page, "greet", "add")).toHaveCSS("opacity", "1");
  await expect(box(page, "version")).not.toHaveCSS("opacity", "1");
  // Both links are still drawn, the faded one too.
  await expect(link(page, "greet", "add")).toHaveCount(1);
  await expect(link(page, "add", "version")).toHaveCount(1);

  // Clicking selects it; it stays lit once the cursor leaves for the empty canvas (Playwright checks nothing covers
  // the corner it hovers).
  await box(page, "greet").click();
  await page.locator(".react-flow__pane").hover({ position: { x: 1, y: 1 } });
  await expect(box(page, "add")).toHaveCSS("opacity", "1");
  await expect(box(page, "version")).not.toHaveCSS("opacity", "1");

  // It and its neighbour are brought into view, clear of the panel.
  await expect(async () => {
    const edge = (await panel(page).boundingBox())!.x;
    for (const id of ["greet", "add"]) {
      const b = (await box(page, id).boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(edge);
    }
  }).toPass();

  // The panel shows the box's title, explanation and the line the PR wrote.
  await expect(panel(page)).toContainText("greet says hi");
  await expect(panel(page)).toContainText("The greeting is shorter now.");
  await expect(panel(page)).toContainText('return "hi " + name;');

  // A link walks to add, whose code the PR didn't change but is still shown.
  await panel(page).getByRole("link", { name: "add" }).click();
  await expect(panel(page)).toContainText("add sums two numbers");
  await expect(panel(page)).toContainText("return a + b;");

  await panel(page).getByTitle("Close").click();
  await expect(panel(page)).toHaveCount(0);
});

test("dark mode: the canvas, the panel and the code follow the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(viewer.url);
  await box(page, "greet").click();
  await expect(panel(page)).toContainText('return "hi " + name;');
  const brightness = (selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      // the colour behind the element: its own background, else the nearest ancestor's that isn't transparent
      for (let e: Element | null = el; e; e = e.parentElement) {
        const [r, g, b, a = 1] = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)!.map(Number);
        if (a > 0) return (r! + g! + b!) / 3;
      }
      return 255;
    });
  expect(await brightness(".react-flow")).toBeLessThan(80);
  expect(await brightness("aside")).toBeLessThan(80);
  expect(await brightness("aside .code-view td, aside .code-view [class*=diff-line]")).toBeLessThan(80);
});

test("the diff view and the panel's width survive a reload", async ({ page }) => {
  await page.goto(viewer.url);
  await box(page, "greet").click();

  // Split shows base and head as two columns.
  const codeColumns = () => panel(page).locator(".code-view").first().evaluate((el) => new Set([...el.querySelectorAll("td")].filter((td) => td.textContent?.includes("return")).map((td) => Math.round(td.getBoundingClientRect().x))).size);
  await page.getByRole("button", { name: "Split" }).click();
  await expect.poll(codeColumns).toBe(2);

  // Drag the panel's edge to 300 pixels from the window's left.
  const h = (await handle(page).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(300, 400, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await panel(page).boundingBox())!.x).toBeCloseTo(300, -1);
  const width = (await panel(page).boundingBox())!.width;

  await page.reload();
  await box(page, "greet").click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs((await panel(page).boundingBox())!.width - width)).toBeLessThanOrEqual(1);

  // Another box opens in Split too; Unified brings back one column.
  await panel(page).getByRole("link", { name: "add" }).click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unified" }).click();
  await expect.poll(codeColumns).toBe(1);
});

test("the panel keeps its share of the window as the window is resized, and stops short of the window's edge", async ({ page }) => {
  await page.goto(viewer.url);
  await box(page, "greet").click();

  // Half of a 1200-pixel window.
  const h = (await handle(page).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 5 });
  await page.mouse.up();
  const width = async () => (await panel(page).boundingBox())!.width;
  await expect.poll(width).toBeCloseTo(600, -1);

  await page.setViewportSize({ width: 1600, height: 800 });
  await expect.poll(width).toBeCloseTo(800, -1);
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(width).toBeCloseTo(500, -1);

  // Dragged all the way left, it leaves 120 pixels of canvas.
  const h2 = (await handle(page).boundingBox())!;
  await page.mouse.move(h2.x + h2.width / 2, 400);
  await page.mouse.down();
  await page.mouse.move(0, 400, { steps: 5 });
  await page.mouse.up();
  await expect.poll(width).toBe(1000 - 120);
});

test.describe("marking code reviewed", () => {
  // Put everything back for the tests that follow.
  test.afterEach(() => {
    viewer.repo.write("app.ts", HEAD);
    clearReview("e2e");
  });

  const getReviewedCheckbox = (page: Page) => panel(page).getByRole("checkbox", { name: "reviewed" });
  /** Loads the page, opens a box's panel, and waits until the panel contains expectedText. */
  const openBox = async (page: Page, id: string, expectedText: string) => {
    await page.goto(viewer.url);
    await box(page, id).click();
    await expect(panel(page)).toContainText(expectedText);
  };
  const greetLineInPr = 'return "hi " + name;';
  const editedGreetLine = 'return "hey " + name;';
  const appWithEditedGreet = HEAD.replace(greetLineInPr, editedGreetLine);

  test("ticking a location's box marks it reviewed, and it stays reviewed after a reload", async ({ page }) => {
    await openBox(page, "greet", greetLineInPr);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();
    await getReviewedCheckbox(page).click(); // the box ticks once the server has saved the mark
    await expect(getReviewedCheckbox(page)).toBeChecked();

    await openBox(page, "greet", greetLineInPr);
    await expect(getReviewedCheckbox(page)).toBeChecked();

    await getReviewedCheckbox(page).click();
    await openBox(page, "greet", greetLineInPr);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();
  });

  test("ticking code that changed after the page showed it marks the lines on screen", async ({ page }) => {
    await openBox(page, "greet", greetLineInPr);
    // Saved while the page still shows the old line.
    viewer.repo.write("app.ts", appWithEditedGreet);
    await getReviewedCheckbox(page).click();
    await expect(getReviewedCheckbox(page)).toBeChecked();

    // After a reload the page shows the new line, which wasn't ticked.
    await openBox(page, "greet", editedGreetLine);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();

    viewer.repo.write("app.ts", HEAD);
    await openBox(page, "greet", greetLineInPr);
    await expect(getReviewedCheckbox(page)).toBeChecked();
  });
});
