// unvibed graph check, and moving or dropping the review threads it finds out of place.
//
//   node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>] [--review <name>]
//   node src/cli.ts thread move <thread-id> <anchor-json>
//   node src/cli.ts thread drop <thread-id> <reason>
//
// check compares each location's diff with the hash and counts the graph
// stores, and prints what they should be where they don't match; and checks
// that every node, edge and location has its own UUID. With --review, it also
// checks that each of that review's threads anchored on the graph's text or
// its code is still in place, and prints what's needed to move or drop each
// one that isn't.
// LEFT locations and code are read at --base (default: merge-base of
// origin/main and HEAD), RIGHT ones at --head (default: the working tree).
//
// thread move gives a thread another anchor, as JSON (shared/thread.ts);
// thread drop marks it as no longer applying.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { check, checkIds, checkThreads, isChecked, type ReadFile } from "./check.ts";
import { createTables } from "./db.ts";
import { defaultBase, show } from "./git.ts";
import { dropThread, firstQuestion, moveThread, threadsOf } from "./threads.ts";
import type { Graph } from "../shared/graph.ts";
import { Anchor } from "../shared/thread.ts";

const usage = [
  "usage: node src/cli.ts check <graph.json> [--base <rev>] [--head <rev>] [--review <name>]",
  "       node src/cli.ts thread move <thread-id> <anchor-json>",
  "       node src/cli.ts thread drop <thread-id> <reason>",
].join("\n");

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({ args: argv, allowPositionals: true, options: { base: { type: "string" }, head: { type: "string" }, review: { type: "string" } } });
  } catch (e) {
    console.error(`${(e as Error).message}\n${usage}`);
    return 2;
  }
  const [command, ...rest] = args.positionals;
  if (command === "check" && rest.length === 1) return checkGraph(rest[0]!, args.values.base ?? defaultBase(), args.values.head, args.values.review);
  if (command === "thread" && rest.length === 3) return changeThread(rest[0]!, rest[1]!, rest[2]!);
  console.error(usage);
  return 2;
}

function checkGraph(file: string, base: string, head: string | undefined, review: string | undefined): number {
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

  let threadProblems = 0;
  if (review !== undefined) {
    createTables();
    const threads = threadsOf(review).filter(isChecked);
    const misplaced = checkThreads(threads, graph, read);
    for (const p of misplaced) {
      const question = firstQuestion(p.thread.id);
      console.log(`✗ thread ${p.thread.id}: ${p.reason}`);
      console.log(`    anchor: ${JSON.stringify(p.thread.anchor)}`);
      console.log(`    quote:  ${JSON.stringify(p.thread.anchor.quote)}`);
      if (p.now !== undefined) console.log(`    now:    ${JSON.stringify(p.now)}`);
      console.log(`    asked:  ${question === undefined ? "nothing yet" : JSON.stringify(question)}`);
    }
    threadProblems = misplaced.length;
    console.log(
      threadProblems
        ? `${threadProblems} of ${threads.length} threads in review ${review} aren't in place: move each with \`node src/cli.ts thread move <thread-id> <anchor-json>\`, or drop it with \`node src/cli.ts thread drop <thread-id> <reason>\``
        : `ok: all ${threads.length} threads in review ${review} are in place`,
    );
  }
  return problems.length || idProblems.length || threadProblems ? 1 : 0;
}

function changeThread(action: string, id: string, value: string): number {
  if (action === "drop") return change(() => dropThread(id, value), `dropped thread ${id}`);
  if (action !== "move") {
    console.error(usage);
    return 2;
  }
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch (e) {
    console.error(`the anchor isn't JSON: ${(e as Error).message}`);
    return 2;
  }
  const anchor = Anchor.safeParse(json);
  if (!anchor.success) {
    console.error(`that isn't an anchor:\n${z.prettifyError(anchor.error)}`);
    return 2;
  }
  return change(() => moveThread(id, anchor.data), `moved thread ${id}`);
}

/** Makes a change to the database, printing what was done, or why it can't be. */
function change(make: () => void, done: string): number {
  createTables();
  try {
    make();
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  console.log(done);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
