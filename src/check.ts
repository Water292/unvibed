import { createHash } from "node:crypto";
import type { Graph, Location } from "./graph.ts";

/** Reads a file's contents on one side of the diff; undefined if it doesn't exist there. */
export type ReadFile = (side: Location["side"], path: string) => string | undefined;

export type Problem = {
  node: string;
  path: string;
  side: Location["side"];
  start_line: number;
  line: number;
  reason: "missing-file" | "out-of-range" | "hash-mismatch";
  /** The lines at the location now, when they could be read. */
  actual?: string[];
};

/** git's blob hash of the lines joined with "\n" (same as `git hash-object`). */
export function hashLines(lines: string[]): string {
  const content = Buffer.from(lines.join("\n"), "utf8");
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

type Read =
  | { ok: true; lines: string[] }
  | { ok: false; reason: "missing-file" | "out-of-range"; lines?: string[] };

function readLocation(loc: Location, read: ReadFile): Read {
  const text = read(loc.side, loc.path);
  if (text === undefined) return { ok: false, reason: "missing-file" };
  const all = splitLines(text);
  const start = loc.start_line ?? loc.line;
  if (start < 1 || loc.line < start || loc.line > all.length) return { ok: false, reason: "out-of-range" };
  return { ok: true, lines: all.slice(start - 1, loc.line) };
}

/** Every location whose code no longer matches its hash. Empty means the graph points at the code it claims to. */
export function check(graph: Graph, read: ReadFile): Problem[] {
  const problems: Problem[] = [];
  for (const node of graph.nodes) {
    for (const loc of node.code) {
      const at = { node: node.id, path: loc.path, side: loc.side, start_line: loc.start_line ?? loc.line, line: loc.line };
      const r = readLocation(loc, read);
      if (!r.ok) problems.push({ ...at, reason: r.reason });
      else if (hashLines(r.lines) !== loc.hash) problems.push({ ...at, reason: "hash-mismatch", actual: r.lines });
    }
  }
  return problems;
}
