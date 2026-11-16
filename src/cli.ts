// unvibed graph check.
//
//   node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>]
//
// Compares each location's diff with the hash and counts the graph stores,
// and prints what they should be where they don't match; and checks that every
// node, edge and location has its own UUID, and that every edge joins two of the graph's nodes.
// Also lists the changed lines no location shows, without failing on them.
// LEFT locations are read at --base (default: merge-base of origin/main and HEAD),
// RIGHT locations at --head (default: the working tree).
//
// Not yet: its report should also break down where it spent its time (diffing, locations, ids, lines not shown),
// from data it observes as it runs. Until then only perf/check.spec.ts measures it.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkEdgeEnds, checkGraph, checkIds, type NotShown, type ReadFile } from "./check.ts";
import { defaultBase, git, show } from "./git.ts";
import type { Graph } from "../shared/graph.ts";

/** How many runs of lines no location shows are listed per file; the rest are counted. */
const RUNS_LISTED = 10;

const usage = "usage: node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>]";

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: { base: { type: "string" }, head: { type: "string" } } });
  } catch (e) {
    console.error(`${(e as Error).message}\n${usage}`);
    return 2;
  }
  const [command, file] = args.positionals;
  if (command !== "check" || !file) {
    console.error(usage);
    return 2;
  }
  const repo = process.cwd();
  const base = args.values.base ?? defaultBase(repo);
  const head = args.values.head;
  const read: ReadFile = (side, path) => {
    const rev = side === "LEFT" ? base : head;
    return show(repo, rev, path);
  };
  const graph = JSON.parse(readFileSync(file, "utf8")) as Graph;

  const changedPaths = git(repo, "diff", "--name-only", base, ...(head ? [head] : [])).trim().split("\n").filter(Boolean);
  const { problems, notShown } = checkGraph(repo, graph, read, changedPaths);
  for (const p of problems) {
    console.log(`✗ ${p.node}: ${p.path}:${p.start_line}-${p.line} (${p.side}) ${p.reason}`);
    for (const l of p.actual ?? []) console.log(`    | ${l}`);
    if (p.expected) console.log(`    should be: hash ${p.expected.hash}, added ${p.expected.added}, removed ${p.expected.removed}`);
  }
  const count = graph.nodes.reduce((n, node) => n + node.code.length, 0);
  console.log(problems.length ? `${problems.length} of ${count} locations do not match` : `ok: all ${count} locations match`);

  // Lines no location shows are reported, never failed on: whoever writes the graph decides which are fine to leave out.
  const linesIn = (n: NotShown) => (n.removed ? n.removed.end - n.removed.start + 1 : 0) + (n.added ? n.added.end - n.added.start + 1 : 0);
  for (const path of new Set(notShown.map((n) => n.path))) {
    const runs = notShown.filter((n) => n.path === path);
    const listed = runs.slice(0, RUNS_LISTED).map((n) => [n.removed && `-${n.removed.start}-${n.removed.end}`, n.added && `+${n.added.start}-${n.added.end}`].filter(Boolean).join(" "));
    const more = runs.length > RUNS_LISTED ? `, and ${runs.length - RUNS_LISTED} more runs` : "";
    console.log(`not shown: ${path}, ${runs.reduce((sum, n) => sum + linesIn(n), 0)} lines: ${listed.join(", ")}${more}`);
  }
  const notShownLines = notShown.reduce((sum, n) => sum + linesIn(n), 0);
  console.log(notShown.length ? `${notShownLines} changed lines no location shows` : "every changed line is shown");

  const idProblems = checkIds(graph);
  for (const p of idProblems)
    console.log(`✗ ${p.kind} ${p.what}: ${p.id === undefined ? "has no id" : `id ${JSON.stringify(p.id)} ${p.reason === "duplicate" ? "is used more than once" : "isn't a UUID"}`}`);
  if (idProblems.length) console.log(`${idProblems.length} ids aren't UUIDs of their own`);

  const titleOf = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const edgeEndProblems = checkEdgeEnds(graph);
  for (const p of edgeEndProblems) {
    const edge = graph.edges.find((e) => e.id === p.id)!;
    const other = p.end === "from" ? edge.to : edge.from;
    console.log(`✗ edge ${JSON.stringify(p.id)} (${p.end === "from" ? "into" : "out of"} "${titleOf.get(other) ?? other}"): its ${p.end} node ${JSON.stringify(p.nodeId)} isn't in the graph`);
  }
  if (edgeEndProblems.length) console.log(`${edgeEndProblems.length} edge ends name nodes the graph doesn't have`);
  return problems.length || idProblems.length || edgeEndProblems.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
