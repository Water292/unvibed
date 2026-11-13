import { expect, test } from "vitest";
import type { Location } from "../../shared/graph.ts";
import { groupLocations } from "../src/group.ts";

/** A location of lines firstLine..lastLine of path on side; grouping reads nothing else, so the rest is blank. */
const createLocation = (path: string, side: Location["side"], firstLine: number, lastLine = firstLine): Location => ({
  id: `${path}:${side}:${firstLine}`,
  path,
  side,
  ...(firstLine === lastLine ? {} : { start_line: firstLine }),
  line: lastLine,
  hash: "",
  added: 0,
  removed: 0,
  text: "",
});

test("locations are grouped by file and side, groups in the order they first appear, each sorted by first line", () => {
  const code = [
    createLocation("b.ts", "RIGHT", 30),
    createLocation("a.ts", "RIGHT", 5),
    createLocation("b.ts", "LEFT", 1),
    createLocation("b.ts", "RIGHT", 10, 12),
  ];
  expect(groupLocations(code).map((g) => g.map((s) => s.index))).toEqual([[3, 0], [1], [2]]);
});
