import type { Graph, Location } from "../shared/graph.ts";
import { getChanges, hashLines, ownRows, splitLines } from "./hunks.ts";

/** Reads a file's contents on one side of the diff; undefined if it doesn't exist there. */
export type ReadFile = (side: Location["side"], path: string) => string | undefined;

export type Problem = {
  node: string;
  path: string;
  side: Location["side"];
  start_line: number;
  line: number;
  reason: "missing-file" | "out-of-range" | "hash-mismatch" | "count-mismatch";
  /** The location's own rows of the diff now, when they could be read. */
  actual?: string[];
};

type Read =
  | { ok: true; rows: string[] }
  | { ok: false; reason: "missing-file" | "out-of-range"; rows?: string[] };

/** Reads locations' own rows, diffing each file once. */
function rowsReader(read: ReadFile) {
  const changes = new Map<string, ReturnType<typeof getChanges>>();
  return (loc: Location): Read => {
    const text = read(loc.side, loc.path);
    if (text === undefined) return { ok: false, reason: "missing-file" };
    const start = loc.start_line ?? loc.line;
    if (start < 1 || loc.line < start || loc.line > splitLines(text).length) return { ok: false, reason: "out-of-range" };
    if (!changes.has(loc.path)) changes.set(loc.path, getChanges(read("LEFT", loc.path), read("RIGHT", loc.path)));
    return { ok: true, rows: ownRows(changes.get(loc.path)!, loc.side, start, loc.line) };
  };
}

/** What a graph stores about a location's rows. */
const stampOf = (rows: string[]) => ({
  hash: hashLines(rows),
  added: rows.filter((r) => r.startsWith("+")).length,
  removed: rows.filter((r) => r.startsWith("-")).length,
});

const problemAt = (node: string, loc: Location) => ({ node, path: loc.path, side: loc.side, start_line: loc.start_line ?? loc.line, line: loc.line });

/** Every location whose diff no longer matches what's stored for it. Empty means the graph describes the change it claims to. */
export function check(graph: Graph, read: ReadFile): Problem[] {
  const rowsOf = rowsReader(read);
  const problems: Problem[] = [];
  for (const node of graph.nodes) {
    for (const loc of node.code) {
      const at = problemAt(node.id, loc);
      const r = rowsOf(loc);
      if (!r.ok) {
        problems.push({ ...at, reason: r.reason });
        continue;
      }
      const stamp = stampOf(r.rows);
      if (stamp.hash !== loc.hash) problems.push({ ...at, reason: "hash-mismatch", actual: r.rows });
      else if (stamp.added !== loc.added || stamp.removed !== loc.removed) problems.push({ ...at, reason: "count-mismatch", actual: r.rows });
    }
  }
  return problems;
}

/**
 * Fills in each location's hash and counts from its diff, in place. Returns the locations it couldn't read, leaving
 * those as they were.
 */
export function stamp(graph: Graph, read: ReadFile): Problem[] {
  const rowsOf = rowsReader(read);
  const problems: Problem[] = [];
  for (const node of graph.nodes) {
    for (const loc of node.code) {
      const r = rowsOf(loc);
      if (r.ok) Object.assign(loc, stampOf(r.rows));
      else problems.push({ ...problemAt(node.id, loc), reason: r.reason });
    }
  }
  return problems;
}
