// A location as the page shows it: the graph's location, and whether it's ticked reviewed.
import type { Graph, Location } from "../../shared/graph.ts";

export class RenderedLocation {
  constructor(
    readonly location: Location,
    readonly ticked: boolean,
  ) {}
}

/** Each node's locations, by node id, ticked by the graph's hash for them in marks. */
export const renderLocations = (graph: Graph, marks: ReadonlyMap<string, boolean>) =>
  new Map(graph.nodes.map((n) => [n.id, n.code.map((l) => new RenderedLocation(l, marks.get(l.hash) ?? false))]));
