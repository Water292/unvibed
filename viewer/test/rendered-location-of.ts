import { RenderedLocation } from "../src/rendered-location.ts";

/** A RenderedLocation with just what review state reads: how many lines it adds and removes, and whether it's ticked. */
export const renderedLocation = (added: number, removed: number, ticked = false) =>
  new RenderedLocation({ id: crypto.randomUUID(), path: "f.ts", side: "RIGHT", line: 1, hash: "h", added, removed, text: "" }, ticked);
