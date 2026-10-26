import { expect, test } from "vitest";
import { clampPanelWidth } from "../src/panel.tsx";

test("the panel is at least 320 pixels wide and leaves 120 pixels of canvas", () => {
  expect(clampPanelWidth(500, 1200)).toBe(500);
  expect(clampPanelWidth(100, 1200)).toBe(320);
  expect(clampPanelWidth(1150, 1200)).toBe(1080);
  // a window too narrow for both: 320 wins
  expect(clampPanelWidth(300, 400)).toBe(320);
});
