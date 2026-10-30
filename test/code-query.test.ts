import { expect, test } from "vitest";
import { CodeQuery } from "../shared/graph-and-code.ts";

test("line numbers must be decimal digits, which Number() alone wouldn't insist on", () => {
  for (const start of ["", "0x10", "1e3"]) expect(CodeQuery.safeParse({ path: "f", side: "RIGHT", start, end: "6" }).success, start).toBe(false);
});
