import type { Graph } from "./graph.ts";

/** A file as it is at the base (old) and the head (new); a side is absent when the file can't be read there. */
export type FileContents = { old?: string; new?: string };

/**
 * What the page loads: the graph; each node's code as one unified diff per location, in order, by node id;
 * and every file those locations point into, whole, by path, for the renderer to draw lines from.
 */
export type GraphAndCode = { graph: Graph; perNodeDiffs: Record<string, string[]>; files: Record<string, FileContents> };
