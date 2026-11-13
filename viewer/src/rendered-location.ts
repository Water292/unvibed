// A location as the page shows it: the graph's location and whether it's ticked reviewed, which give its review
// state. Changed code is yellow until it's ticked, then green; code that didn't change has nothing to review, so it
// isn't tinted.
import type { Graph, Location } from "../../shared/graph.ts";

export enum ReviewState {
  Unchanged = "unchanged",
  NeedsReview = "needs review",
  Reviewed = "reviewed",
}

// Translucent, so the same tints work on a light and a dark background.
export const NEEDS_REVIEW = "rgba(234, 179, 8, 0.25)";
export const REVIEWED = "rgba(34, 197, 94, 0.22)";

export class RenderedLocation {
  constructor(
    readonly location: Location,
    readonly ticked: boolean,
  ) {}

  /** Whether it adds or removes any lines, which is what makes it something to review. */
  get changed() {
    return this.location.added + this.location.removed > 0;
  }

  get state(): ReviewState {
    if (!this.changed) return ReviewState.Unchanged;
    return this.ticked ? ReviewState.Reviewed : ReviewState.NeedsReview;
  }
}

/** Each node's locations, by node id, ticked by their hash in marks. */
export const renderLocations = (graph: Graph, marks: ReadonlyMap<string, boolean>) =>
  new Map(graph.nodes.map((n) => [n.id, n.code.map((l) => new RenderedLocation(l, marks.get(l.hash) ?? false))]));

const TINTS: Record<ReviewState, string | undefined> = {
  [ReviewState.Unchanged]: undefined,
  [ReviewState.NeedsReview]: NEEDS_REVIEW,
  [ReviewState.Reviewed]: REVIEWED,
};
export const tint = (state: ReviewState) => TINTS[state];
