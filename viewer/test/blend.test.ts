import { expect, test } from "vitest";
import { CONTEXT } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
import { blend, groupLocations, type Widen } from "../src/blend.ts";

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

const unwidened = (): Widen => ({ above: 0, below: 0 });
const indexes = (segments: ReturnType<typeof blend>) => segments.map((s) => s.items.map((i) => i.index));

// Two locations as far apart as they can be while no line is hidden between them: 10 shows to 10 + CONTEXT, NEAR from
// the next line on.
const NEAR = 10 + 2 * CONTEXT + 1;

test("two locations are one box once no line is hidden between the lines each shows", () => {
  const [touching] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", NEAR)]);
  expect(blend(touching!, unwidened)).toEqual([{ items: touching, start: 10, end: NEAR, above: 0, below: 0 }]);
  // one line further, and one line is between them
  const [apart] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", NEAR + 1)]);
  expect(indexes(blend(apart!, unwidened))).toEqual([[0], [1]]);
});

test("↓ on one location or ↑ on the next joins them once it reaches, and the box shows as far as any of them was widened", () => {
  const [group] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", 40, 42)]);
  // the widening that leaves no line between 10's lines and 40's
  const reach = 40 - NEAR;
  const first = (w: Widen) => (i: number) => (i === 0 ? w : unwidened());
  const second = (w: Widen) => (i: number) => (i === 1 ? w : unwidened());
  expect(indexes(blend(group!, first({ above: 0, below: reach - 1 })))).toEqual([[0], [1]]);
  expect(indexes(blend(group!, first({ above: 0, below: reach })))).toEqual([[0, 1]]);
  // ↓ past the second's last line: the box shows that far below it
  expect(blend(group!, first({ above: 5, below: 40 }))).toEqual([{ items: group, start: 10, end: 42, above: 5, below: 8 }]);
  expect(indexes(blend(group!, second({ above: reach - 1, below: 0 })))).toEqual([[0], [1]]);
  expect(blend(group!, second({ above: reach, below: 0 }))).toEqual([{ items: group, start: 10, end: 42, above: 0, below: 0 }]);
});

test("a location inside another is in its box", () => {
  const [group] = groupLocations([at("f", "RIGHT", 10, 50), at("f", "RIGHT", 20, 22), at("f", "RIGHT", 80)]);
  expect(blend(group!, unwidened).map((s) => [s.items.map((i) => i.index), s.start, s.end])).toEqual([
    [[0, 1], 10, 50],
    [[2], 80, 80],
  ]);
});
