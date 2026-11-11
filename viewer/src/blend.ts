// Which of a node's locations the side panel draws in one code box. A node's
// locations in the same file on the same side are a group; two of a group run
// together into one box once the lines one shows, widened by ↑ and ↓, reach
// the lines the next shows.
import { CONTEXT } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";

export const startOf = (l: Location) => l.start_line ?? l.line;

/** One of the node's locations, with where it is in the node's list. */
export type Indexed = { location: Location; index: number };

/** A node's locations by file and side, in the order each group first appears, each group sorted by first line. */
export function groupLocations(code: Location[]): Indexed[][] {
  const groups = new Map<string, Indexed[]>();
  code.forEach((location, index) => {
    const key = `${location.side}:${location.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ location, index });
  });
  return [...groups.values()].map((g) => g.sort((a, b) => startOf(a.location) - startOf(b.location) || a.location.line - b.location.line));
}

/** How many lines ↑ (above) and ↓ (below) have added to a location. */
export type Widen = { above: number; below: number };

/**
 * One box: its locations in order, and the cut that shows them all, lines start..end widened by above and below:
 * from the first location's first line to the furthest last line, widened as far as any of them was.
 */
export type Segment = { items: Indexed[]; start: number; end: number; above: number; below: number };

/** The first and last line a box shows: its lines, what ↑ / ↓ added, and the CONTEXT lines the server keeps. */
const firstShown = (s: Segment) => s.start - s.above - CONTEXT;
const lastShown = (s: Segment) => s.end + s.below + CONTEXT;

/**
 * A group's locations, run together where their lines meet: a location joins the box before it when no line is hidden
 * between them, the first line it shows coming right after, or before, the last line that box shows.
 */
export function blend(group: Indexed[], widen: (index: number) => Widen): Segment[] {
  const segments: Segment[] = [];
  for (const item of group) {
    const { above, below } = widen(item.index);
    const next: Segment = { items: [item], start: startOf(item.location), end: item.location.line, above, below };
    const last = segments.at(-1);
    if (last && firstShown(next) <= lastShown(last) + 1) {
      // the box's first and last line shown, before CONTEXT, once this location joins
      const from = Math.min(last.start - last.above, next.start - above);
      const to = Math.max(last.end + last.below, next.end + below);
      last.items.push(item);
      last.end = Math.max(last.end, next.end);
      last.above = last.start - from;
      last.below = to - last.end;
    } else segments.push(next);
  }
  return segments;
}
