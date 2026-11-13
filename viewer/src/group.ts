// A node's locations in the same file are a group: the side panel asks for a
// group's code in one request, and the server runs those whose lines meet
// into one code box. A file's diff holds both its versions, before and after
// the change, so locations in either version share a group.
import type { Location } from "../../shared/graph.ts";

export const startOf = (l: Location) => l.start_line ?? l.line;

/** One of the node's locations, with where it is in the node's list. */
export type Indexed = { location: Location; index: number };

/**
 * A node's locations by file, in the order the node first mentions each file, each group in the node's order. The
 * server puts a group's locations in the order they come in the file.
 */
export function groupLocations(code: Location[]): Indexed[][] {
  const indexed = code.map((location, index) => ({ location, index }));
  // a Set keeps each path once, where it first appears
  const paths = [...new Set(code.map((l) => l.path))];
  return paths.map((path) => indexed.filter(({ location }) => location.path === path));
}
