// How fast a big graph opens: the page drawing every box, and the server answering each location's code. Each test
// reports what it measured, per box and per location so the numbers stay comparable at any graph size, and flags it
// as a regression when it's past its target. It fails only if the page or the server doesn't work, never on time.
// Opt-in: it has its own folder and config, which only `mise run perf` uses; `npx playwright test` and `mise run check`
// never see it.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { diffOf } from "../src/check.ts";
import { getChanges, ownRows } from "../src/hunks.ts";
import type { CodeAnswer } from "../shared/graph-and-code.ts";
import type { Graph, Location } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { startViewer } from "../e2e/start-viewer.ts";

const FILES = 20;
const NODES = 200;
/** Locations whose code is timed, one after another. */
const TIMED_LOCATIONS = 10;
/** Targets, about half again what each takes on an M-series Mac: milliseconds to draw the whole graph (about 200)
 * and per box drawn (about 1), and for one location's code (about 80-100). */
const LOAD_TARGET = 300;
const LOAD_TARGET_PER_BOX = 1.5;
const CODE_TARGET_PER_LOCATION = 150;

/** Prints a measurement, and flags it as a regression, in the output and in the test's report, if it's past its target. */
function report(what: string, ms: number, target: number) {
  console.log(`${what}: ${ms.toFixed(2)}ms (target ${target}ms)`);
  if (ms <= target) return;
  const regression = `${what} regressed: ${ms.toFixed(2)}ms, past its ${target}ms target`;
  console.warn(`⚠ ${regression}`);
  test.info().annotations.push({ type: "perf regression", description: regression });
}

// f<n>.ts at the base: 100 lines, one constant each. The head changes every tenth line, from line 5 on, so a file has
// 10 changes, 10 lines apart.
const base = (file: number) => Array.from({ length: 100 }, (_, i) => `export const v${i + 1} = ${file};\n`).join("");
const head = (file: number) => base(file).replace(/^export const v(\d*5) = (\d+);$/gm, "export const v$1 = $2 + 1;");

let viewer: Awaited<ReturnType<typeof startViewer>>;
let graph: Graph;
test.beforeAll(async ({}, { parallelIndex }) => {
  const repo = tempRepo();
  for (let f = 0; f < FILES; f++) repo.write(`f${f}.ts`, base(f));
  repo.git("add", ".");
  repo.git("commit", "-qm", "base");
  for (let f = 0; f < FILES; f++) repo.write(`f${f}.ts`, head(f));
  process.chdir(repo.dir); // so getChanges stores its blobs in this repo

  // Node n's location is the next change in its file, with the line above and below it, so every location is a
  // different change. Links make a binary tree: n links to 2n+1 and 2n+2.
  const changes = Array.from({ length: FILES }, (_, f) => getChanges(base(f), head(f)));
  const nodes = Array.from({ length: NODES }, (_, n) => {
    const file = n % FILES;
    const start = Math.floor(n / FILES) * 10 + 4;
    const line = start + 2;
    const location: Location = { id: randomUUID(), path: `f${file}.ts`, side: "RIGHT", start_line: start, line, ...diffOf(ownRows(changes[file]!, "RIGHT", start, line)), text: "" };
    return { id: randomUUID(), title: `node ${n}`, text: "", code: [location] };
  });
  const edges = nodes.flatMap((_, n) => [2 * n + 1, 2 * n + 2].filter((c) => c < NODES).map((c) => ({ id: randomUUID(), from: nodes[n]!.id, to: nodes[c]!.id })));
  graph = { schema: "test", nodes, edges };
  repo.write("graph.json", JSON.stringify(graph));
  viewer = await startViewer(repo.dir, 4760 + parallelIndex, ["--base", "HEAD"]);
});
test.afterAll(() => viewer.stop());

test(`how long a graph of ${NODES} nodes takes to draw every box`, async ({ page }) => {
  // React Flow hides a box until it has measured it, then shows it where it goes.
  const allDrawn = (count: number) => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".react-flow__node")];
    return boxes.length === count && boxes.every((b) => getComputedStyle(b).visibility === "visible") && performance.now();
  };
  // The first visit has Vite compile the page; the timed one is served what's compiled, as a reviewer is.
  await page.goto(viewer.url);
  await page.waitForFunction(allDrawn, NODES);
  await page.reload();
  // performance.now() counts from the start of this page's navigation
  const ms = (await (await page.waitForFunction(allDrawn, NODES)).jsonValue()) as number;
  report(`drawing the whole graph of ${NODES} boxes`, ms, LOAD_TARGET);
  report("drawing a box", ms / NODES, LOAD_TARGET_PER_BOX);
});

test("how long the server takes to answer one location's code", async () => {
  const times: number[] = [];
  for (const l of graph.nodes.slice(0, TIMED_LOCATIONS).map((n) => n.code[0]!)) {
    // asked as the panel asks for a file with one location in it, not widened
    const q = new URLSearchParams({ path: l.path, at: [l.side, l.start_line ?? l.line, l.line, 0, 0].join(",") });
    const start = performance.now();
    const res = await fetch(`${viewer.url}code?${q}`);
    const answer: CodeAnswer = await res.json();
    times.push(performance.now() - start);
    expect(res.ok).toBe(true);
    expect(answer.own[0]!.hash).toBe(l.hash);
  }
  times.sort((a, b) => a - b);
  console.log(`a location's code in ${Math.round(times[times.length >> 1]!)}ms (median), ${Math.round(times.at(-1)!)}ms (slowest)`);
  report("a location's code (slowest)", times.at(-1)!, CODE_TARGET_PER_LOCATION);
});
