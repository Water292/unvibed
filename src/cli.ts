// unvibed graph check and stamp.
//
//   node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>]
//   node src/cli.ts stamp <graph.json> [--base <rev>] [--head <rev>]
//
// check compares each location's diff with the hash and counts the graph
// stores; stamp fills them in, writing the file only if every location reads.
// LEFT locations are read at --base (default: merge-base of origin/main and HEAD),
// RIGHT locations at --head (default: the working tree).
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { check, stamp, type ReadFile } from "./check.ts";
import { defaultBase, show } from "./git.ts";
import type { Graph } from "../shared/graph.ts";

const usage = "usage: node src/cli.ts check|stamp <graph.json> [--base <rev>] [--head <rev>]";

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: { base: { type: "string" }, head: { type: "string" } } });
  } catch (e) {
    console.error(`${(e as Error).message}\n${usage}`);
    return 2;
  }
  const [command, file] = args.positionals;
  if ((command !== "check" && command !== "stamp") || !file) {
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

  const problems = command === "stamp" ? stamp(graph, read) : check(graph, read);
  for (const p of problems) {
    console.log(`✗ ${p.node}: ${p.path}:${p.start_line}-${p.line} (${p.side}) ${p.reason}`);
    for (const l of p.actual ?? []) console.log(`    | ${l}`);
  }
  const count = graph.nodes.reduce((n, node) => n + node.code.length, 0);
  if (command === "stamp") {
    if (!problems.length) writeFileSync(file, JSON.stringify(graph, null, 2) + "\n");
    console.log(problems.length ? `${problems.length} of ${count} locations can't be read, nothing written` : `ok: stamped all ${count} locations`);
    return problems.length ? 1 : 0;
  }
  console.log(problems.length ? `${problems.length} of ${count} locations do not match` : `ok: all ${count} locations match`);
  return problems.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
