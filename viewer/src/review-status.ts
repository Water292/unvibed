// What's left to review, as colour: a location or a node is tinted yellow while some of its changed code isn't
// marked reviewed, and green once all of it is; code that didn't change has nothing to review, so it isn't tinted.
// A node also has a bar along its top, red for the share of its lines removed and green for the share added.
import type { CSSProperties } from "react";
import type { Location } from "../../shared/graph.ts";

// Translucent, so the same tints work on a light and a dark background.
export const NEEDS_REVIEW = "rgba(234, 179, 8, 0.25)";
export const REVIEWED = "rgba(34, 197, 94, 0.22)";
const REMOVED = "#ef4444";
const ADDED = "#22c55e";
const BAR_HEIGHT = 4;

/** Whether a location adds or removes any lines, which is what makes it something to review. */
export const isChanged = (l: Location) => l.added + l.removed > 0;

/** The tint for these locations together, by the marks (by hash) they're ticked in; undefined if none changed. */
export function tint(locations: Location[], marks: ReadonlyMap<string, boolean>): string | undefined {
  const changed = locations.filter(isChanged);
  if (!changed.length) return undefined;
  return changed.every((l) => marks.get(l.hash)) ? REVIEWED : NEEDS_REVIEW;
}

/**
 * A node's tint, and its removed / added bar over it, as background images, which leave the node's own background
 * colour, and so its light or dark theme, in place. Nothing if none of its locations changed.
 */
export function nodeBackground(locations: Location[], marks: ReadonlyMap<string, boolean>): CSSProperties {
  const color = tint(locations, marks);
  if (!color) return {};
  const added = locations.reduce((n, l) => n + l.added, 0);
  const removed = locations.reduce((n, l) => n + l.removed, 0);
  const removedShare = (100 * removed) / (added + removed);
  return {
    backgroundImage: `linear-gradient(to right, ${REMOVED} ${removedShare}%, ${ADDED} ${removedShare}%), linear-gradient(${color}, ${color})`,
    backgroundSize: `100% ${BAR_HEIGHT}px, 100% 100%`,
    backgroundRepeat: "no-repeat",
  };
}
