import type { HunkData } from "react-diff-view";
import type { Graph } from "./graph.ts";

/** What the page loads: the graph, and each node's code as one hunk per location, in order, by node id. */
export type GraphAndCode = { graph: Graph; perNodeHunks: Record<string, HunkData[]> };
