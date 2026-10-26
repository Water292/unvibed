import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import { hashLines } from "../src/check.ts";

test("the hash is git's blob hash of the lines", () => {
  const lines = ["// naïve → café", "🤖"];
  const git = execFileSync("git", ["hash-object", "--stdin"], { input: lines.join("\n") }).toString().trim();
  expect(hashLines(lines)).toBe(git);
});
