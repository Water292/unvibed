// A location as the page shows it. For now it holds just the graph's location; what the page knows about it beyond
// the graph goes here.
import type { Graph, Location } from "../../shared/graph.ts";

export class RenderedLocation {
  constructor(readonly location: Location) {}
}

/** Each node's locations, by node id. */
export const renderLocations = (graph: Graph) => new Map(graph.nodes.map((n) => [n.id, n.code.map((l) => new RenderedLocation(l))]));
