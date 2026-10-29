import { z } from "zod";
import type { Graph, Location } from "./graph.ts";

/** A file as it is at the base (old) and the head (new); a side is absent when the file can't be read there. */
export type FileContents = { old?: string; new?: string };

/**
 * One of a node's locations as the page shows it: its diff, and the hash of its own rows of that diff (empty if
 * there's nothing in its range), which marks are made by.
 */
export type LocationView = { location: Location; diff: string; hash: string };

/**
 * What the page loads: the graph; each node's locations, by node id; the files they point into, whole, by path, for
 * the renderer to draw lines from; and the hashes of the lines marked reviewed.
 */
export type GraphAndCode = {
  graph: Graph;
  perNodeLocations: Record<string, LocationView[]>;
  files: Record<string, FileContents>;
  reviewed: string[];
};

/** Marks the lines with this hash reviewed, or not. The server checks each request against it. */
export const MarkRequest = z.object({ hash: z.string().min(1), reviewed: z.boolean() });
export type MarkRequest = z.infer<typeof MarkRequest>;
