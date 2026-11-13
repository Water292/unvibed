import { expect, test } from "vitest";
import { renderLocations, ReviewState, tint } from "../src/rendered-location.ts";
import { renderedLocation } from "./rendered-location-of.ts";

test("changed code needs review until it's ticked, then is reviewed; unchanged code is neither", () => {
  expect(renderedLocation(1, 0).state).toBe(ReviewState.NeedsReview);
  expect(renderedLocation(0, 2, true).state).toBe(ReviewState.Reviewed);
  expect(renderedLocation(0, 0, true).state).toBe(ReviewState.Unchanged);
  expect(tint(ReviewState.Unchanged)).toBeUndefined();
});

test("a graph's locations are ticked by their hash in the marks; an untick counts as not ticked", () => {
  const [a, b, c] = [renderedLocation(1, 0), renderedLocation(1, 0), renderedLocation(1, 0)].map((r, i) => ({ ...r.location, hash: `h${i}` }));
  const graph = { schema: "test", nodes: [{ id: "n", title: "", text: "", code: [a!, b!, c!] }], edges: [] };
  const ticked = renderLocations(graph, new Map([["h0", true], ["h1", false]])).get("n")!.map((l) => l.ticked);
  expect(ticked).toEqual([true, false, false]);
});
