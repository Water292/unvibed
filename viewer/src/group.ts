// A node's locations in the same file on the same side are a group: the side
// panel asks for a group's code in one request, and the server runs those
// whose lines meet into one code box.
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
