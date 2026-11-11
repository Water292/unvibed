import { expect, test } from "vitest";
import type { Location } from "../../shared/graph.ts";
import { groupLocations } from "../src/group.ts";

const at = (path: string, side: Location["side"], start: number, line = start): Location => ({
  id: `${path}:${side}:${start}`,
  path,
  side,
  ...(start === line ? {} : { start_line: start }),
  line,
  hash: "",
  added: 0,
  removed: 0,
  text: "",
});

test("locations are grouped by file and side, groups in the order they first appear, each sorted by first line", () => {
  const code = [at("b.ts", "RIGHT", 30), at("a.ts", "RIGHT", 5), at("b.ts", "LEFT", 1), at("b.ts", "RIGHT", 10, 12)];
  expect(groupLocations(code).map((g) => g.map((s) => s.index))).toEqual([[3, 0], [1], [2]]);
});
