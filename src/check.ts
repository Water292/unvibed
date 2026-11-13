import { z } from "zod";
import type { Graph, Location } from "../shared/graph.ts";
import { show } from "./git.ts";
import { getChanges, hashLines, ownRows, splitLines } from "./hunks.ts";

/** Reads a file's contents on one side of the diff; undefined if it doesn't exist there. */
export type ReadFile = (side: Location["side"], path: string) => string | undefined;

/**
 * Reads LEFT files at base and RIGHT files at head (the working tree if undefined), each file once per side, so a
 * check of many locations in one file runs git for it only once.
 */
export function readAt(base: string, head: string | undefined): ReadFile {
  const contents = new Map<string, string | undefined>();
  return (side, path) => {
    const key = `${side}:${path}`;
    if (!contents.has(key)) contents.set(key, show(side === "LEFT" ? base : head, path));
    return contents.get(key);
  };
}

export type Problem = {
  node: string;
  path: string;
  side: Location["side"];
  start_line: number;
  line: number;
  reason: "missing-file" | "out-of-range" | "hash-mismatch" | "count-mismatch";
  /** The location's own rows of the diff now, and what the graph should store for them, when they could be read. */
  actual?: string[];
  expected?: Diff;
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

/** What a graph stores about a location's rows: their hash, and how many were added and removed. */
type Diff = { hash: string; added: number; removed: number };
export const diffOf = (rows: string[]): Diff => ({
  hash: hashLines(rows),
  added: rows.filter((r) => r.startsWith("+")).length,
  removed: rows.filter((r) => r.startsWith("-")).length,
});

/** Every location whose diff no longer matches what's stored for it. Empty means the graph describes the change it claims to. */
export function check(graph: Graph, read: ReadFile): Problem[] {
  const rowsOf = rowsReader(read);
  const problems: Problem[] = [];
  for (const node of graph.nodes) {
    for (const loc of node.code) {
      const at = { node: node.id, path: loc.path, side: loc.side, start_line: loc.start_line ?? loc.line, line: loc.line };
      const r = rowsOf(loc);
      if (!r.ok) {
        problems.push({ ...at, reason: r.reason });
        continue;
      }
      const expected = diffOf(r.rows);
      if (expected.hash !== loc.hash) problems.push({ ...at, reason: "hash-mismatch", actual: r.rows, expected });
      else if (expected.added !== loc.added || expected.removed !== loc.removed) problems.push({ ...at, reason: "count-mismatch", actual: r.rows, expected });
    }
  }
  return problems;
}

const REASONS: Record<Problem["reason"], string> = {
  "missing-file": "its file isn't there",
  "out-of-range": "its lines run past the end of the file",
  "hash-mismatch": "its lines changed",
  "count-mismatch": "its added and removed counts are wrong",
};
/** A problem in words, for whoever reads the graph: which location, in which node, and what's wrong with it. */
export const describeProblem = (p: Problem, title: string) => `${p.path}:${p.start_line}-${p.line} (${p.side}) in "${title}": ${REASONS[p.reason]}`;

/** An RFC 9562 UUID: any version from 1 to 8, or the all-zero or all-f one. */
const UUID = z.uuid();

export type IdProblem = {
  kind: "node" | "edge" | "location";
  /** The id as the graph has it; undefined if it has none. */
  id: string | undefined;
  /** Which node, edge or location, in words, for whoever fixes it. */
  what: string;
  reason: "not-a-uuid" | "duplicate";
};

/** Every node, edge and location whose id isn't a UUID, or is one something else in the graph also has. */
export function checkIds(graph: Graph): IdProblem[] {
  const titleOf = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const all = [
    ...graph.nodes.map((n) => ({ kind: "node" as const, id: n.id, what: `"${n.title}"` })),
    ...graph.edges.map((e) => ({ kind: "edge" as const, id: e.id, what: `"${titleOf.get(e.from) ?? e.from}" → "${titleOf.get(e.to) ?? e.to}"` })),
    ...graph.nodes.flatMap((n) =>
      n.code.map((l) => ({ kind: "location" as const, id: l.id, what: `${l.path}:${l.start_line ?? l.line}-${l.line} (${l.side}) in "${n.title}"` })),
    ),
  ];
  const uses = new Map<string, number>();
  for (const { id } of all) if (typeof id === "string") uses.set(id, (uses.get(id) ?? 0) + 1);
  return all.flatMap((x): IdProblem[] =>
    !UUID.safeParse(x.id).success
      ? [{ ...x, reason: "not-a-uuid" as const }]
      : uses.get(x.id)! > 1
        ? [{ ...x, reason: "duplicate" as const }]
        : [],
  );
}
