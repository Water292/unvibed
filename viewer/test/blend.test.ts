import { expect, test } from "vitest";
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

test("two locations are one box once the lines each shows, 3 around each, reach each other", () => {
  // 10 shows 7..13, 17 shows 14..20: they meet
  const [touching] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", 17)]);
  expect(blend(touching!, unwidened)).toEqual([{ items: touching, start: 10, end: 17, above: 0, below: 0 }]);
  // 10 shows 7..13, 18 shows 15..21: line 14 is between them
  const [apart] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", 18)]);
  expect(indexes(blend(apart!, unwidened))).toEqual([[0], [1]]);
});

test("↓ on one location or ↑ on the next joins them, and the box shows as far as any of them was widened", () => {
  const [group] = groupLocations([at("f", "RIGHT", 10), at("f", "RIGHT", 40, 42)]);
  expect(indexes(blend(group!, unwidened))).toEqual([[0], [1]]);
  // ↓ once on the first: 10 shows to 33, 40 from 37; ↓ twice: to 53
  expect(indexes(blend(group!, (i) => (i === 0 ? { above: 0, below: 20 } : unwidened())))).toEqual([[0], [1]]);
  expect(blend(group!, (i) => (i === 0 ? { above: 5, below: 40 } : unwidened()))).toEqual([{ items: group, start: 10, end: 42, above: 5, below: 8 }]);
  // ↑ on the second: 40 shows from 17 - 3
  expect(blend(group!, (i) => (i === 1 ? { above: 23, below: 0 } : unwidened()))).toEqual([{ items: group, start: 10, end: 42, above: 0, below: 0 }]);
});

test("a location inside another is in its box", () => {
  const [group] = groupLocations([at("f", "RIGHT", 10, 50), at("f", "RIGHT", 20, 22), at("f", "RIGHT", 80)]);
  expect(blend(group!, unwidened).map((s) => [s.items.map((i) => i.index), s.start, s.end])).toEqual([
    [[0, 1], 10, 50],
    [[2], 80, 80],
  ]);
});
