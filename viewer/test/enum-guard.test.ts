import { expect, test } from "vitest";
import { enumGuard } from "../src/enum-guard.ts";

enum Fruit {
  Apple = "apple",
  Pear = "pear",
}

test("true only for the enum's values, not its names or anything else", () => {
  const isFruit = enumGuard(Fruit);
  expect(["apple", "pear", "Apple", "plum", null, undefined, 1].map(isFruit)).toEqual([true, true, false, false, false, false, false]);
});
