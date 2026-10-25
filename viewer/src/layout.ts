import type { Graph } from "../../shared/graph.ts";

/** Where a node sits, in grid cells rather than pixels. */
export type Cell = { column: number; row: number };

/**
 * Lays nodes out so links point right wherever possible.
 *
 * Code can be circular, so the graph may have cycles. Walking the graph
 * depth-first, in the order nodes and links are listed, every link that leads
 * back to a node still being walked closes a cycle: that link is the one
 * that points back. All other links point right: a node's column is one past
 * the furthest node linking to it.
 *
 * Rows: a node nothing links to (rightwards) starts a new band below
 * everything placed so far; any other node goes at its parent's row or
 * lower, in the next free row of its column. Same graph, same picture.
 */
export function layout(graph: Graph): Map<string, Cell> {
  const back = closingLinks(graph);
  const forward = graph.edges.filter((e) => !back.has(key(e)));
  const parents = (id: string) => forward.filter((e) => e.to === id).map((e) => e.from);

  // columns: longest path along forward links
  const column = new Map<string, number>();
  const columnOf = (id: string): number => {
    if (!column.has(id)) column.set(id, Math.max(-1, ...parents(id).map(columnOf)) + 1);
    return column.get(id)!;
  };
  for (const n of graph.nodes) columnOf(n.id);

  // a node nothing links to sits just left of the nearest node it links to,
  // rather than far away in the first column
  for (const n of graph.nodes) {
    const children = forward.filter((e) => e.from === n.id).map((e) => column.get(e.to)!);
    if (parents(n.id).length === 0 && children.length) column.set(n.id, Math.max(0, Math.min(...children) - 1));
  }

  // rows: by column, then by list order
  const order = graph.nodes.map((n, i) => ({ id: n.id, i })).sort((a, b) => columnOf(a.id) - columnOf(b.id) || a.i - b.i);
  const cells = new Map<string, Cell>();
  const nextFree = new Map<number, number>();
  let bottom = 0;
  for (const { id } of order) {
    const col = columnOf(id);
    const placed = parents(id).map((p) => cells.get(p)!);
    const row = placed.length ? Math.max(nextFree.get(col) ?? 0, Math.min(...placed.map((c) => c.row))) : bottom;
    cells.set(id, { column: col, row });
    nextFree.set(col, row + 1);
    bottom = Math.max(bottom, row + 1);
  }
  return cells;
}

const key = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

/** The links that close a cycle, found by a depth-first walk in list order. */
export function closingLinks(graph: Graph): Set<string> {
  const back = new Set<string>();
  const state = new Map<string, "walking" | "done">();
  const walk = (id: string) => {
    state.set(id, "walking");
    for (const e of graph.edges.filter((e) => e.from === id)) {
      if (state.get(e.to) === "walking") back.add(key(e));
      else if (!state.has(e.to)) walk(e.to);
    }
    state.set(id, "done");
  };
  for (const n of graph.nodes) if (!state.has(n.id)) walk(n.id);
  return back;
}
