// Whether a thread is still where it was started: its anchor's text still
// exists, and the characters at start..end are exactly its quote.
import type { ReadFile } from "./check.ts";
import { splitLines } from "./hunks.ts";
import type { Graph } from "../shared/graph.ts";
import type { Anchor, Range } from "../shared/thread.ts";

/** Why an anchor isn't in place. */
export type Misplaced = "missing-node" | "missing-edge" | "missing-location" | "missing-file" | "out-of-range" | "quote-mismatch";

/** In place, or why not, with the characters at the anchor's start..end now, as far as its text has them, when it has text. */
export type Placement = { ok: true } | { ok: false; reason: Misplaced; now?: string };

/** Whether a range is in place in a text: inside it, and holding exactly its quote. */
export function place(range: Range, text: string): Placement {
  const now = text.slice(range.start, range.end);
  if (range.end < range.start || range.end > text.length) return { ok: false, reason: "out-of-range", now };
  return now === range.quote ? { ok: true } : { ok: false, reason: "quote-mismatch", now };
}

/** An anchor on the graph's own text or on code, the anchors graph check checks; the others are in threads. */
export type GraphAnchor = Exclude<Anchor, { in: "message" | "summary" }>;
export const onGraph = (anchor: Anchor): anchor is GraphAnchor => anchor.in !== "message" && anchor.in !== "summary";

/** Whether an anchor is in place in a graph, and for code, in the files read. */
export function placeInGraph(anchor: GraphAnchor, graph: Graph, read: ReadFile): Placement {
  switch (anchor.in) {
    case "node-title":
    case "node-text": {
      const node = graph.nodes.find((n) => n.id === anchor.nodeId);
      if (!node) return { ok: false, reason: "missing-node" };
      return place(anchor, anchor.in === "node-title" ? node.title : node.text);
    }
    case "edge-note": {
      const edge = graph.edges.find((e) => e.id === anchor.edgeId);
      if (!edge) return { ok: false, reason: "missing-edge" };
      return place(anchor, edge.note ?? "");
    }
    case "location-text": {
      const location = graph.nodes.flatMap((n) => n.code).find((l) => l.id === anchor.locationId);
      if (!location) return { ok: false, reason: "missing-location" };
      return place(anchor, location.text);
    }
    case "code": {
      const file = read(anchor.side, anchor.path);
      if (file === undefined) return { ok: false, reason: "missing-file" };
      const lines = splitLines(file);
      const text = lines.slice(anchor.startLine - 1, anchor.endLine).join("\n");
      if (anchor.endLine < anchor.startLine || anchor.endLine > lines.length) return { ok: false, reason: "out-of-range", now: text.slice(anchor.start, anchor.end) };
      return place(anchor, text);
    }
  }
}
