import { expect, test } from "vitest";
import type { Location } from "../../shared/graph.ts";
import { renderLocations } from "../src/rendered-location.ts";

const location = (hash: string): Location => ({ id: crypto.randomUUID(), path: "f.ts", side: "RIGHT", line: 1, hash, added: 1, removed: 0, text: "" });

test("a graph's locations are ticked by the graph's hash for them in the marks; an untick counts as not ticked", () => {
  const graph = { schema: "test", nodes: [{ id: "n", title: "", text: "", code: [location("h0"), location("h1"), location("h2")] }], edges: [] };
  const ticked = renderLocations(graph, new Map([["h0", true], ["h1", false]])).get("n")!.map((l) => l.ticked);
  expect(ticked).toEqual([true, false, false]);
});
