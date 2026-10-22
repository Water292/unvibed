import { expect, test } from "vitest";
import type { Graph } from "../src/graph.ts";
import { closingLinks, layout } from "../viewer/src/layout.ts";

const node = (id: string) => ({ id, title: id, text: "", code: [] });
const graph = (ids: string[], links: [string, string][]): Graph => ({
  schema: "test",
  nodes: ids.map(node),
  edges: links.map(([from, to]) => ({ from, to })),
});

test("every link points right when there is no cycle, whatever the list order", () => {
  // c is listed first but is linked to by b, so it still goes right of b
  const g = graph(["c", "a", "b"], [["a", "b"], ["b", "c"]]);
  const cells = layout(g);
  for (const e of g.edges) expect(cells.get(e.to)!.column).toBeGreaterThan(cells.get(e.from)!.column);
});

test("in a cycle, only the link that closes it points back", () => {
  // a calls b, b calls back into a
  const g = graph(["a", "b"], [["a", "b"], ["b", "a"]]);
  expect(closingLinks(g)).toEqual(new Set(["b->a"]));
  const cells = layout(g);
  expect(cells.get("b")!.column).toBeGreaterThan(cells.get("a")!.column);
});

test("a node nothing links to sits just left of the nearest node it links to", () => {
  // t (like a test) points at c, at the end of a -> b -> c
  const g = graph(["a", "b", "c", "t"], [["a", "b"], ["b", "c"], ["t", "c"]]);
  const cells = layout(g);
  expect(cells.get("t")!.column).toBe(cells.get("c")!.column - 1);
});

test("a node nothing links to starts a new band below everything", () => {
  // two unrelated parts: a -> b, and d -> e
  const g = graph(["a", "b", "d", "e"], [["a", "b"], ["d", "e"]]);
  const cells = layout(g);
  const a = cells.get("a")!, b = cells.get("b")!, d = cells.get("d")!, e = cells.get("e")!;
  expect(d.row).toBeGreaterThan(Math.max(a.row, b.row));
  expect(e.row).toBe(d.row);
  expect(e.column).toBeGreaterThan(d.column);
});
