// A node as the canvas shows it, the canvas's alternative to the panel: the graph's node, its locations as the page
// shows them, and the review state and colours they give the node's box. The box is tinted by its state, and has a
// bar along its top, red for the share of its lines removed and green for the share added.
import type { CSSProperties } from "react";
import type { Graph, Node } from "../../../shared/graph.ts";
import { ReviewState, tint, type RenderedLocation } from "../rendered-location.ts";

const REMOVED = "#ef4444";
const ADDED = "#22c55e";
const BAR_HEIGHT = 4;

export class RenderedNode {
  constructor(
    readonly node: Node,
    readonly locations: RenderedLocation[],
  ) {}

  /** Needs review if any of its locations does, else reviewed if any is, else unchanged. */
  get state(): ReviewState {
    const states = new Set(this.locations.map((l) => l.state));
    if (states.has(ReviewState.NeedsReview)) return ReviewState.NeedsReview;
    return states.has(ReviewState.Reviewed) ? ReviewState.Reviewed : ReviewState.Unchanged;
  }

  get added() {
    return this.locations.reduce((n, l) => n + l.location.added, 0);
  }

  get removed() {
    return this.locations.reduce((n, l) => n + l.location.removed, 0);
  }

  /**
   * Its tint, and its removed / added bar over it, as background images, which leave the box's own background
   * colour, and so its light or dark theme, in place. Nothing if none of its locations changed.
   */
  get background(): CSSProperties {
    const color = tint(this.state);
    if (!color) return {};
    const removedShare = (100 * this.removed) / (this.added + this.removed);
    return {
      backgroundImage: `linear-gradient(to right, ${REMOVED} ${removedShare}%, ${ADDED} ${removedShare}%), linear-gradient(${color}, ${color})`,
      backgroundSize: `100% ${BAR_HEIGHT}px, 100% 100%`,
      backgroundRepeat: "no-repeat",
    };
  }
}

/** Each node as the canvas shows it, with its locations, by node id. */
export const renderNodes = (graph: Graph, locations: ReadonlyMap<string, RenderedLocation[]>) =>
  new Map(graph.nodes.map((n) => [n.id, new RenderedNode(n, locations.get(n.id)!)]));
