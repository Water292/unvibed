import { rmSync, symlinkSync } from "node:fs";
import { expect, test } from "vitest";
import { git, isRepoFile } from "../src/git.ts";

const top = git("rev-parse", "--show-toplevel").trim();

test("on disk, a file git lists is a repo file", () => {
  expect(isRepoFile(undefined, "package.json")).toBe(true);
  expect(isRepoFile(undefined, "src/git.ts")).toBe(true);
});

test("on disk, paths out of the repo, ignored files, .git, folders and pathspec tricks are not", () => {
  for (const path of ["", "../package.json", "/etc/passwd", "src/../../package.json", "node_modules/vite/package.json", ".git/config", "src", "src/", "*.json", ":(glob)**", "a//b"])
    expect(isRepoFile(undefined, path), path).toBe(false);
});

test("on disk, a symlink is not, even one git would list", () => {
  const link = `${top}/escape-test-link`;
  symlinkSync("/etc/hosts", link);
  try {
    expect(isRepoFile(undefined, "escape-test-link")).toBe(false);
  } finally {
    rmSync(link);
  }
});

test("at a commit, a file in its tree is a repo file; a folder or a path out of it is not", () => {
  expect(isRepoFile("HEAD", "package.json")).toBe(true);
  for (const path of ["src", "../package.json", "/etc/passwd", "no-such-file"]) expect(isRepoFile("HEAD", path), path).toBe(false);
});
