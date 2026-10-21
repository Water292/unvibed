// unvibed graph check.
//
//   node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>]
//
// LEFT locations are read at --base (default: merge-base of main and HEAD),
// RIGHT locations at --head (default: the working tree).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { check, type ReadFile } from "./check.ts";
import type { Graph } from "./graph.ts";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });

/** A file as it is at a commit, or on disk when no commit is given; undefined if it doesn't exist there. */
function show(rev: string | undefined, path: string): string | undefined {
  try {
    if (rev) return git("show", `${rev}:${path}`);
    return readFileSync(`${git("rev-parse", "--show-toplevel").trim()}/${path}`, "utf8");
  } catch {
    return undefined;
  }
}

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
  const base = args.values.base ?? git("merge-base", "main", "HEAD").trim();
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
  }
  const count = graph.nodes.reduce((n, node) => n + node.code.length, 0);
  console.log(problems.length ? `${problems.length} of ${count} locations do not match` : `ok: all ${count} locations match`);
  return problems.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
