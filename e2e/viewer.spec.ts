// The viewer as a user meets it: `node src/view.ts graph.json` on a real repo, in a real browser.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { clearReview, createTables } from "../src/review.ts";
import type { Graph } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { hashLines } from "../src/hunks.ts";
import { startViewer } from "./start-viewer.ts";

// app.ts at the base and at the head: the head replaces greet's line; add and version don't change.
const BASE = 'export function greet(name: string) {\n  return "hello " + name;\n}\n\nexport function add(a: number, b: number) {\n  return a + b;\n}\n\nexport const version = 1;\n';
const HEAD = BASE.replace('"hello "', '"hi "');

// Three boxes in a row, greet -> add -> version: greet's code changed in the PR, add's and version's didn't.
const [GREET_UUID, ADD_UUID, VERSION_UUID] = [randomUUID(), randomUUID(), randomUUID()];
const graph: Graph = {
  schema: "test",
  nodes: [
    { id: GREET_UUID, title: "greet says hi", text: "The greeting is shorter now.", code: [{ id: randomUUID(), path: "app.ts", side: "RIGHT", line: 2, hash: hashLines(['-  return "hello " + name;', '+  return "hi " + name;']), added: 1, removed: 1, text: "" }] },
    { id: ADD_UUID, title: "add sums two numbers", text: "Unchanged, shown for context.", code: [{ id: randomUUID(), path: "app.ts", side: "RIGHT", start_line: 5, line: 7, hash: hashLines([" export function add(a: number, b: number) {", "   return a + b;", " }"]), added: 0, removed: 0, text: "" }] },
    { id: VERSION_UUID, title: "the version", text: "Still 1.", code: [{ id: randomUUID(), path: "app.ts", side: "RIGHT", line: 9, hash: hashLines([" export const version = 1;"]), added: 0, removed: 0, text: "" }] },
  ],
  edges: [
    { id: randomUUID(), from: GREET_UUID, to: ADD_UUID },
    { id: randomUUID(), from: ADD_UUID, to: VERSION_UUID },
  ],
};

// A repo with the base committed and the PR's change left uncommitted, its graph, and the viewer serving them.
let repo: ReturnType<typeof tempRepo>;
let viewer: Awaited<ReturnType<typeof startViewer>>;
test.beforeAll(async ({}, { parallelIndex }) => {
  repo = tempRepo();
  repo.write("app.ts", BASE);
  repo.git("add", ".");
  repo.git("commit", "-qm", "base");
  repo.write("app.ts", HEAD);
  repo.write("graph.json", JSON.stringify(graph));
  process.chdir(repo.dir); // so createTables opens this repo's database, which the viewer shares
  createTables();
  // Each Playwright worker running at the same time has its own parallelIndex, so its own port.
  viewer = await startViewer(repo.dir, 4700 + parallelIndex, ["--base", "HEAD"]);
});
test.afterAll(() => viewer.stop());

const box = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const link = (page: Page, from: string, to: string) => {
  const edge = graph.edges.find((e) => e.from === from && e.to === to)!;
  return page.locator(`.react-flow__edge[data-id="${edge.id}"] path`).first();
};
const panel = (page: Page) => page.locator("aside");
const handle = (page: Page) => page.getByTitle("Drag to resize");

test("read a graph: hover lights a box's neighbourhood, clicking opens its panel, links walk the graph", async ({ page }) => {
  await page.goto(viewer.url);

  // Hovering greet keeps it, its link and add lit; version fades.
  await box(page, GREET_UUID).hover();
  await expect(box(page, GREET_UUID)).toHaveCSS("opacity", "1");
  await expect(box(page, ADD_UUID)).toHaveCSS("opacity", "1");
  await expect(link(page, GREET_UUID, ADD_UUID)).toHaveCSS("opacity", "1");
  await expect(box(page, VERSION_UUID)).not.toHaveCSS("opacity", "1");
  // Both links are still drawn, the faded one too.
  await expect(link(page, GREET_UUID, ADD_UUID)).toHaveCount(1);
  await expect(link(page, ADD_UUID, VERSION_UUID)).toHaveCount(1);

  // Clicking selects it; it stays lit once the cursor leaves for the empty canvas (Playwright checks nothing covers
  // the corner it hovers).
  await box(page, GREET_UUID).click();
  await page.locator(".react-flow__pane").hover({ position: { x: 1, y: 1 } });
  await expect(box(page, ADD_UUID)).toHaveCSS("opacity", "1");
  await expect(box(page, VERSION_UUID)).not.toHaveCSS("opacity", "1");

  // It and its neighbour are brought into view, clear of the panel.
  await expect(async () => {
    const edge = (await panel(page).boundingBox())!.x;
    for (const id of [GREET_UUID, ADD_UUID]) {
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
  await panel(page).getByRole("link", { name: "add sums two numbers" }).click();
  await expect(panel(page)).toContainText("add sums two numbers");
  await expect(panel(page)).toContainText("return a + b;");

  await panel(page).getByTitle("Close").click();
  await expect(panel(page)).toHaveCount(0);
});

test("dark mode: the canvas, the panel and the code follow the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(viewer.url);
  await box(page, GREET_UUID).click();
  await expect(panel(page)).toContainText('return "hi " + name;');
  const brightness = (selector: string) =>
    page.locator(selector).first().evaluate((el) => {
      // the colour that shows behind the element: its own background and its ancestors', each translucent one (a
      // tint) laid over the ones below it, down to the nearest opaque one, or white
      const layers: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const [r, g, b, a = 1] = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)!.map(Number);
        if (a > 0) layers.push([r!, g!, b!, a]);
        if (a === 1) break;
      }
      let shown = [255, 255, 255];
      for (const [r, g, b, a] of layers.reverse()) shown = [r!, g!, b!].map((c, i) => c * a! + shown[i]! * (1 - a!));
      return (shown[0]! + shown[1]! + shown[2]!) / 3;
    });
  expect(await brightness(".react-flow")).toBeLessThan(80);
  expect(await brightness("aside")).toBeLessThan(80);
  expect(await brightness("aside .code-view td, aside .code-view [class*=diff-line]")).toBeLessThan(80);
});

test("the diff view and the panel's width survive a reload", async ({ page }) => {
  await page.goto(viewer.url);
  await box(page, GREET_UUID).click();

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
  await box(page, GREET_UUID).click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  expect(Math.abs((await panel(page).boundingBox())!.width - width)).toBeLessThanOrEqual(1);

  // Another box opens in Split too; Unified brings back one column.
  await panel(page).getByRole("link", { name: "add sums two numbers" }).click();
  await expect(page.getByRole("button", { name: "Split" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Unified" }).click();
  await expect.poll(codeColumns).toBe(1);
});

test("the panel keeps its share of the window as the window is resized, and stops short of the window's edge", async ({ page }) => {
  await page.goto(viewer.url);
  await box(page, GREET_UUID).click();

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
    repo.write("app.ts", HEAD);
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
    await openBox(page, GREET_UUID, greetLineInPr);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();
    await getReviewedCheckbox(page).click(); // the box ticks once the server has saved the mark
    await expect(getReviewedCheckbox(page)).toBeChecked();

    await openBox(page, GREET_UUID, greetLineInPr);
    await expect(getReviewedCheckbox(page)).toBeChecked();

    await getReviewedCheckbox(page).click();
    await openBox(page, GREET_UUID, greetLineInPr);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();
  });

  test("changed code is yellow, on its node and its box, until ticked, then green, after a reload too; unchanged code isn't tinted", async ({ page }) => {
    const [yellow, green] = ["rgba(234, 179, 8, 0.25)", "rgba(34, 197, 94, 0.22)"];
    const nodeBackground = (id: string) => box(page, id).evaluate((el) => getComputedStyle(el).backgroundImage);
    // the location's box: the code and the line above it with its path and reviewed box
    const locationBox = () => panel(page).locator(".code-view").locator("..");

    await openBox(page, GREET_UUID, greetLineInPr);
    // greet's one location removes a line and adds one: its bar is half red, half green
    expect(await nodeBackground(GREET_UUID)).toContain("linear-gradient(to right, rgb(239, 68, 68) 50%, rgb(34, 197, 94) 50%)");
    expect(await nodeBackground(GREET_UUID)).toContain(yellow);
    await expect(locationBox()).toHaveCSS("background-color", yellow);
    expect(await nodeBackground(ADD_UUID)).toBe("none");

    await getReviewedCheckbox(page).click();
    await expect(locationBox()).toHaveCSS("background-color", green);
    await expect.poll(() => nodeBackground(GREET_UUID)).toContain(green);

    // the page loads the review's marks with the graph, so the node is green before anything opens
    await page.reload();
    await expect.poll(() => nodeBackground(GREET_UUID)).toContain(green);

    await box(page, ADD_UUID).click();
    await expect(panel(page)).toContainText("return a + b;");
    await expect(locationBox()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("ticking code that changed after the page showed it marks the lines on screen", async ({ page }) => {
    await openBox(page, GREET_UUID, greetLineInPr);
    // Saved while the page still shows the old line.
    repo.write("app.ts", appWithEditedGreet);
    await getReviewedCheckbox(page).click();
    await expect(getReviewedCheckbox(page)).toBeChecked();

    // After a reload the page shows the new line, which wasn't ticked.
    await openBox(page, GREET_UUID, editedGreetLine);
    await expect(getReviewedCheckbox(page)).not.toBeChecked();

    repo.write("app.ts", HEAD);
    await openBox(page, GREET_UUID, greetLineInPr);
    await expect(getReviewedCheckbox(page)).toBeChecked();
  });
});
