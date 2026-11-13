// A node as the canvas shows it, the canvas's alternative to the panel. For now it holds just the graph's node; what
// the canvas knows about it beyond the graph goes here.
import type { Graph, Node } from "../../../shared/graph.ts";

export class RenderedNode {
  constructor(readonly node: Node) {}
}

/** Each node as the canvas shows it, by node id. */
export const renderNodes = (graph: Graph) => new Map(graph.nodes.map((n) => [n.id, new RenderedNode(n)]));
