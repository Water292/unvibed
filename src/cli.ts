// unvibed graph check.
//
//   node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>]
//
// Compares each location's diff with the hash and counts the graph stores,
// and prints what they should be where they don't match; and checks that every
// node, edge and location has its own UUID, and that every edge joins two of the graph's nodes.
// LEFT locations are read at --base (default: merge-base of origin/main and HEAD),
// RIGHT locations at --head (default: the working tree).
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { check, checkEdgeEnds, checkIds, type ReadFile } from "./check.ts";
import { defaultBase, show } from "./git.ts";
import type { Graph } from "../shared/graph.ts";

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
  const base = args.values.base ?? defaultBase();
  const head = args.values.head;
  const read: ReadFile = (side, path) => {
    const rev = side === "LEFT" ? base : head;
    return show(rev, path);
  };
  const graph = JSON.parse(readFileSync(file, "utf8")) as Graph;

  const problems = check(graph, read);
  for (const p of problems) {
    console.log(`✗ ${p.node}: ${p.path}:${p.start_line}-${p.line} (${p.side}) ${p.reason}`);
    for (const l of p.actual ?? []) console.log(`    | ${l}`);
    if (p.expected) console.log(`    should be: hash ${p.expected.hash}, added ${p.expected.added}, removed ${p.expected.removed}`);
  }
  const count = graph.nodes.reduce((n, node) => n + node.code.length, 0);
  console.log(problems.length ? `${problems.length} of ${count} locations do not match` : `ok: all ${count} locations match`);

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
