import { expect, test } from "vitest";
import type { Location } from "../../shared/graph.ts";
import { nodeBackground, NEEDS_REVIEW, REVIEWED, tint } from "../src/review-status.ts";

const at = (hash: string, added: number, removed: number): Location => ({ id: crypto.randomUUID(), path: "f.ts", side: "RIGHT", line: 1, hash, added, removed, text: "" });
const marks = (...reviewed: string[]) => new Map(reviewed.map((h) => [h, true]));

test("changed code is yellow until all of it is ticked, then green; unchanged code isn't tinted", () => {
  const [a, b, same] = [at("a", 1, 0), at("b", 0, 2), at("same", 0, 0)];
  expect(tint([a, b, same], marks())).toBe(NEEDS_REVIEW);
  expect(tint([a, b, same], marks("a"))).toBe(NEEDS_REVIEW);
  expect(tint([a, b, same], marks("a", "b"))).toBe(REVIEWED);
  expect(tint([same], marks())).toBeUndefined();
  // an untick counts as not reviewed
  expect(tint([a], new Map([["a", false]]))).toBe(NEEDS_REVIEW);
});

test("a node's bar is red for its share of removed lines, green for added, summed over its locations", () => {
  const background = nodeBackground([at("a", 3, 1), at("b", 0, 0), at("c", 3, 0)], marks());
  // 1 removed of 7 changed lines: about 14% red
  expect(background.backgroundImage).toMatch(/^linear-gradient\(to right, #ef4444 14\.28\d*%, #22c55e 14\.28\d*%\)/);
  expect(background.backgroundImage).toContain(NEEDS_REVIEW);
  expect(nodeBackground([at("b", 0, 0)], marks())).toEqual({});
});
