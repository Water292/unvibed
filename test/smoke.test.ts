import { expect, test } from "vitest";
import { name } from "../src/index.js";

test("the toolchain runs", () => {
  expect(name).toBe("unvibed");
});
