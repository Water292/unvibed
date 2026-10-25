import type { Graph } from "./graph.ts";

/** What the page loads: the graph, and each node's code as one unified diff per location, in order, by node id. */
export type GraphAndCode = { graph: Graph; perNodeDiffs: Record<string, string[]> };
