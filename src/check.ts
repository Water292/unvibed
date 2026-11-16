import { z } from "zod";
import type { Graph, Location } from "../shared/graph.ts";
import { getChanges, hashRows, hunkIn, ownRows, splitLines } from "./hunks.ts";

/** Reads a file's contents on one side of the diff; undefined if it doesn't exist there. */
export type ReadFile = (side: Location["side"], path: string) => string | undefined;

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

type Change = ReturnType<typeof getChanges>[number];

/** Reads each file's changes, diffing it once in repo. */
function changesReader(repo: string, read: ReadFile) {
  const changes = new Map<string, Change[]>();
  return (path: string): Change[] => {
    if (!changes.has(path)) changes.set(path, getChanges(repo, read("LEFT", path), read("RIGHT", path)));
    return changes.get(path)!;
  };
}

/** Reads locations' own rows, with each file's changes from changesOf. */
function rowsReader(read: ReadFile, changesOf: (path: string) => Change[]) {
  return (loc: Location): Read => {
    const text = read(loc.side, loc.path);
    if (text === undefined) return { ok: false, reason: "missing-file" };
    const start = loc.start_line ?? loc.line;
    if (start < 1 || loc.line < start || loc.line > splitLines(text).length) return { ok: false, reason: "out-of-range" };
    return { ok: true, rows: ownRows(changesOf(loc.path), loc.side, start, loc.line) };
  };
}

/** A run of changed lines in one file that no location shows: the removed lines' and the added lines' numbers, where there are any. */
export type NotShown = { path: string; removed?: { start: number; end: number }; added?: { start: number; end: number } };

/** Every run of changed lines in paths that no location in graph shows. */
function notShownIn(graph: Graph, read: ReadFile, changesOf: (path: string) => Change[], paths: string[]): NotShown[] {
  const runs: NotShown[] = [];
  for (const path of paths) {
    const changes = changesOf(path);
    const shown = new Set<Change>();
    for (const loc of graph.nodes.flatMap((n) => n.code).filter((l) => l.path === path)) {
      const text = read(loc.side, loc.path);
      if (text === undefined) continue;
      for (const c of hunkIn(changes, loc.side, loc.start_line ?? loc.line, loc.line)) if (c.type !== "normal") shown.add(c);
    }
    let run: Change[] = [];
    const endRun = () => {
      const removed = run.filter((c) => c.type === "delete").map((c) => c.lineNumber);
      const added = run.filter((c) => c.type === "insert").map((c) => c.lineNumber);
      if (run.length)
        runs.push({
          path,
          ...(removed.length ? { removed: { start: removed[0]!, end: removed.at(-1)! } } : {}),
          ...(added.length ? { added: { start: added[0]!, end: added.at(-1)! } } : {}),
        });
      run = [];
    };
    for (const c of changes) {
      if (c.type !== "normal" && !shown.has(c)) run.push(c);
      else endRun();
    }
    endRun();
  }
  return runs;
}

/** What a graph stores about a location's rows: their hash, and how many were added and removed. */
type Diff = { hash: string; added: number; removed: number };
export const diffOf = (rows: string[]): Diff => ({
  hash: hashRows(rows),
  added: rows.filter((r) => r.startsWith("+")).length,
  removed: rows.filter((r) => r.startsWith("-")).length,
});

/** Every location whose diff no longer matches what's stored for it. Empty means the graph describes the change it claims to. */
export function check(repo: string, graph: Graph, read: ReadFile): Problem[] {
  return checkGraph(repo, graph, read, []).problems;
}

/** check's problems, and every run of changed lines in changedPaths that no location shows; each file is diffed once for both. */
export function checkGraph(repo: string, graph: Graph, read: ReadFile, changedPaths: string[]): { problems: Problem[]; notShown: NotShown[] } {
  const changesOf = changesReader(repo, read);
  return { problems: locationProblems(graph, read, changesOf), notShown: notShownIn(graph, read, changesOf, changedPaths) };
}

function locationProblems(graph: Graph, read: ReadFile, changesOf: (path: string) => Change[]): Problem[] {
  const rowsOf = rowsReader(read, changesOf);
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

export type EdgeEndProblem = {
  /** The edge's id. */
  id: string;
  /** Which end names a node the graph doesn't have, and the id it names. */
  end: "from" | "to";
  nodeId: string;
};

/** Every end of an edge that names a node the graph doesn't have, as an edge left over from a bigger graph would. */
export function checkEdgeEnds(graph: Graph): EdgeEndProblem[] {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  return graph.edges.flatMap((e) =>
    (["from", "to"] as const).filter((end) => !nodeIds.has(e[end])).map((end) => ({ id: e.id, end, nodeId: e[end] })),
  );
}
