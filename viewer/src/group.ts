// A node's locations in the same file are a group: the side panel asks for a
// group's code in one request, and the server runs those whose lines meet
// into one code box. A file's diff holds both its versions, before and after
// the change, so locations in either version share a group.
import type { Location } from "../../shared/graph.ts";

export const startOf = (l: Location) => l.start_line ?? l.line;

/**
 * A node's locations, split by file. In: the node's locations, in its order. Out: one entry per file, in the order
 * the node first names each file, holding that file's locations in the node's order. The server puts a group's
 * locations in the order they come in the file.
 */
export function groupLocationsByFile(code: Location[]): { path: string; locations: Location[] }[] {
  // Map.groupBy puts each location under its path in one pass; a Map keeps its paths in the order they were first added
  const locationsByPath = Map.groupBy(code, (location) => location.path);
  return [...locationsByPath].map(([path, locations]) => ({ path, locations }));
}
