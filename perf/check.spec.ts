// How long graph check takes, on a change of 20 small files the graph shows and a package-lock.json of 40,000 lines,
// a fifth of them changed and 5,000 added, that the graph leaves out. Reports the check of the graph's locations, then
// the whole check, which also reports every changed line no location shows; the difference is what those lines cost.
// Reports, and flags a regression past a target; never fails on time.
import { randomUUID } from "node:crypto";
import { test } from "@playwright/test";
import { check, checkGraph, diffOf } from "../src/check.ts";
import { show } from "../src/git.ts";
import { getChanges, ownRows } from "../src/hunks.ts";
import type { Graph, Location } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";

const FILES = 20;
const LOCK_LINES = 40_000;
/** Targets, about half again what each takes on an M-series Mac: milliseconds for the locations' check, and for what
 * reporting the lines no location shows adds to it. */
const LOCATIONS_TARGET = 1500;
const NOT_SHOWN_TARGET = 500;

/** Prints a measurement, and flags it as a regression, in the output and in the test's report, if it's past its target. */
function report(what: string, ms: number, target: number) {
  console.log(`${what}: ${ms.toFixed(0)}ms (target ${target}ms)`);
  if (ms <= target) return;
  const regression = `${what} regressed: ${ms.toFixed(0)}ms, past its ${target}ms target`;
  console.warn(`⚠ ${regression}`);
  test.info().annotations.push({ type: "perf regression", description: regression });
}

const small = (file: number, version: number) => Array.from({ length: 100 }, (_, i) => `export const v${i + 1} = ${i % 10 === 4 ? file + version : file};\n`).join("");
const lock = (version: number, extra: number) =>
  Array.from({ length: LOCK_LINES + extra }, (_, i) => `    "node_modules/pkg-${i}": { "version": "1.${i % 5 === 0 ? version : 0}.${i}" },\n`).join("");

test("graph check, with a huge lockfile no location shows", () => {
  const repo = tempRepo();
  for (let f = 0; f < FILES; f++) repo.write(`f${f}.ts`, small(f, 0));
  repo.write("package-lock.json", lock(0, 0));
  repo.git("add", ".");
  repo.git("commit", "-qm", "base");
  for (let f = 0; f < FILES; f++) repo.write(`f${f}.ts`, small(f, 1));
  repo.write("package-lock.json", lock(1, 5_000));

  // one location per small file, over the whole file
  const nodes = Array.from({ length: FILES }, (_, f) => {
    const rows = ownRows(getChanges(repo.dir, small(f, 0), small(f, 1)), "RIGHT", 1, 100);
    const location: Location = { id: randomUUID(), path: `f${f}.ts`, side: "RIGHT", start_line: 1, line: 100, ...diffOf(rows), text: "" };
    return { id: randomUUID(), title: `file ${f}`, text: "", code: [location] };
  });
  const graph: Graph = { schema: "test", nodes, edges: [] };
  const read = (side: Location["side"], path: string) => show(repo.dir, side === "LEFT" ? "HEAD" : undefined, path);
  const changedPaths = [...Array.from({ length: FILES }, (_, f) => `f${f}.ts`), "package-lock.json"];

  const locationsStarted = performance.now();
  check(repo.dir, graph, read);
  const locationsMs = performance.now() - locationsStarted;

  const wholeStarted = performance.now();
  const { problems, notShown } = checkGraph(repo.dir, graph, read, changedPaths);
  const wholeMs = performance.now() - wholeStarted;

  console.log(`${problems.length} location problems; ${notShown.length} runs not shown, all in ${[...new Set(notShown.map((n) => n.path))].join(", ")}`);
  report(`graph check of ${FILES} files' locations`, locationsMs, LOCATIONS_TARGET);
  report(`reporting the ${LOCK_LINES}-line lockfile no location shows`, wholeMs - locationsMs, NOT_SHOWN_TARGET);
});
