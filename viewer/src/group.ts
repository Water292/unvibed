// A node's locations in the same file are a group: the side panel asks for a
// group's code in one request, and the server runs those whose lines meet
// into one code box. A file's diff holds both its versions, before and after
// the change, so locations in either version share a group.
import type { Location } from "../../shared/graph.ts";
import type { RenderedLocation } from "./rendered-location.ts";

export const startOf = (l: Location) => l.start_line ?? l.line;

/**
 * A node's locations, split by file. In: the node's locations. Out: one entry per file, holding that file's
 * locations, the files sorted by where the node first names each. A file's locations can be in any order: the
 * server puts them in the order they come in the file.
 */
export function groupLocationsByFile(locations: RenderedLocation[]): { path: string; locations: RenderedLocation[] }[] {
  // each location with its position in the node's list, put under its file
  const placedByPath = Map.groupBy(
    locations.map((rendered, position) => ({ rendered, position })),
    ({ rendered }) => rendered.location.path,
  );
  const groups = [...placedByPath].map(([path, placed]) => ({
    path,
    locations: placed.map(({ rendered }) => rendered),
    firstPosition: Math.min(...placed.map(({ position }) => position)),
  }));
  return groups.toSorted((a, b) => a.firstPosition - b.firstPosition).map(({ path, locations }) => ({ path, locations }));
}
