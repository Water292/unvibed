import { expect, test } from "vitest";
import { RenderedNode } from "../src/react-flow/rendered-node.ts";
import { NEEDS_REVIEW, type RenderedLocation, ReviewState } from "../src/rendered-location.ts";
import { renderedLocation } from "./rendered-location-of.ts";

const renderedNode = (...locations: RenderedLocation[]) => new RenderedNode({ id: "n", title: "", text: "", code: locations.map((l) => l.location) }, locations);

test("a node needs review while any of its locations does, is reviewed once all changed ones are, else is unchanged", () => {
  expect(renderedNode(renderedLocation(1, 0), renderedLocation(0, 2, true), renderedLocation(0, 0)).state).toBe(ReviewState.NeedsReview);
  expect(renderedNode(renderedLocation(1, 0, true), renderedLocation(0, 2, true), renderedLocation(0, 0)).state).toBe(ReviewState.Reviewed);
  expect(renderedNode(renderedLocation(0, 0)).state).toBe(ReviewState.Unchanged);
});

test("a node's bar is red for its share of removed lines, green for added, summed over its locations", () => {
  const background = renderedNode(renderedLocation(3, 1), renderedLocation(0, 0), renderedLocation(3, 0)).background;
  // 1 removed of 7 changed lines: about 14% red
  expect(background.backgroundImage).toMatch(/^linear-gradient\(to right, #ef4444 14\.28\d*%, #22c55e 14\.28\d*%\)/);
  expect(background.backgroundImage).toContain(NEEDS_REVIEW);
  expect(renderedNode(renderedLocation(0, 0)).background).toEqual({});
});
