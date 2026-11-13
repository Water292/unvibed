import { expect, test } from "vitest";
import type { Location } from "../../shared/graph.ts";
import { groupLocations } from "../src/group.ts";

// Fake locations for the tests: only the file matters to grouping, and the side and line numbers make each one easy
// to tell apart.
function createLocation(path: string, side: Location["side"], firstLine: number, lastLine: number): Location {
  return {
    id: crypto.randomUUID(),
    path,
    side,
    // a location on one line has no separate first line
    start_line: firstLine === lastLine ? undefined : firstLine,
    line: lastLine,
    hash: "",
    added: 0,
    removed: 0,
    text: "",
  };
}

// Each location as "file side first-last", so the expected groups read as the locations themselves.
const label = (l: Location) => `${l.path} ${l.side} ${l.start_line ?? l.line}-${l.line}`;
const grouped = (code: Location[]) => groupLocations(code).map((group) => group.map(({ location }) => label(location)));

test("a file's locations are one group, old and new lines together, in the node's order", () => {
  const code = [createLocation("a.ts", "RIGHT", 30, 30), createLocation("a.ts", "LEFT", 1, 1), createLocation("a.ts", "RIGHT", 10, 12)];
  expect(grouped(code)).toEqual([["a.ts RIGHT 30-30", "a.ts LEFT 1-1", "a.ts RIGHT 10-12"]]);
});

test("each file is its own group, in the order the node first mentions it", () => {
  const code = [createLocation("b.ts", "RIGHT", 5, 5), createLocation("a.ts", "RIGHT", 1, 1), createLocation("b.ts", "RIGHT", 9, 9)];
  expect(grouped(code)).toEqual([["b.ts RIGHT 5-5", "b.ts RIGHT 9-9"], ["a.ts RIGHT 1-1"]]);
});

test("each location keeps its place in the node's list, which its reviewed box reports by", () => {
  const code = [createLocation("b.ts", "RIGHT", 5, 5), createLocation("a.ts", "RIGHT", 1, 1), createLocation("b.ts", "RIGHT", 9, 9)];
  expect(groupLocations(code).map((group) => group.map(({ index }) => index))).toEqual([[0, 2], [1]]);
});
