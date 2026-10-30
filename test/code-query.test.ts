import { expect, test } from "vitest";
import { CodeQuery } from "../shared/graph-and-code.ts";

const parse = (q: Record<string, string>) => CodeQuery.safeParse({ path: "src/git.ts", side: "RIGHT", start: "4", end: "6", ...q });

test("a location's fields parse to typed values, unwidened unless above / below are given", () => {
  expect(parse({}).data).toEqual({ path: "src/git.ts", side: "RIGHT", start: 4, end: 6, above: 0, below: 0 });
  expect(parse({ side: "LEFT", above: "20", below: "40" }).data).toMatchObject({ side: "LEFT", above: 20, below: 40 });
});

test("line numbers must be decimal digits", () => {
  for (const start of ["", "0x10", "1e3", " 3", "+3", "Infinity", "2.5", "-1", "abc"]) expect(parse({ start }).success, start).toBe(false);
  for (const above of ["", "2.5", "-1"]) expect(parse({ above }).success, above).toBe(false);
});

test("start is at least 1 and end at least start; side is LEFT or RIGHT; path is given", () => {
  expect(parse({ start: "0" }).success).toBe(false);
  expect(parse({ start: "7", end: "6" }).success).toBe(false);
  expect(parse({ side: "left" }).success).toBe(false);
  expect(parse({ path: "" }).success).toBe(false);
  expect(CodeQuery.safeParse({ side: "RIGHT", start: "1", end: "1" }).success).toBe(false);
});
