import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { codeFor } from "../src/hunks.ts";
import { gitWithInput } from "../src/git.ts";
import { MarkRequest } from "../shared/graph-and-code.ts";
import { currentBranch, mark, readReview } from "../src/review.ts";
import type { Location } from "../shared/graph.ts";
import { tempRepo } from "./temp-repo.ts";

// Marks in a real repo, read as the viewer reads them.

let repo: ReturnType<typeof tempRepo>;
let base: string;
let cwd: string;
const REVIEW = "pr"; // the review these tests mark in
const writeLines = (path: string, lines: string[]) => repo.write(path, lines.join("\n") + "\n");

// One repo for every test in this file. The tests run from inside it, because the code they test runs git in the
// current directory.
beforeAll(() => {
  cwd = process.cwd();
  repo = tempRepo();
  process.chdir(repo.dir);
  writeLines("f.ts", ["a", "b", "c"]);
  repo.git("add", ".");
  repo.git("commit", "-q", "-m", "base");
  base = repo.git("rev-parse", "HEAD");
});

afterAll(() => {
  process.chdir(cwd);
  rmSync(repo.dir, { recursive: true, force: true });
});

// Each test starts from the PR's change, with no other files and nothing marked.
beforeEach(() => {
  writeLines("f.ts", ["a", "b", "c", "d", "e"]); // the PR adds d and e
  repo.git("clean", "-fdq");
  rmSync(join(repo.dir, ".git/unvibed-reviews.sqlite"), { force: true });
});

const createLocation = (firstLine: number, lastLine: number, path = "f.ts", side: Location["side"] = "RIGHT"): Location => ({
  path,
  side,
  start_line: firstLine,
  line: lastLine,
  hash: "",
});

/** What the page gets for a location, against a base: its hash, and whether it's reviewed. */
function getLocationView(loc: Location, from = base) {
  const { hash } = codeFor(from, undefined).createLocationView(loc);
  return { hash, reviewed: readReview(REVIEW).includes(hash) };
}

/** Ticks a location as the page does, by its hash. */
const tick = (loc: Location, reviewed = true) => mark(REVIEW, getLocationView(loc).hash, reviewed);

test("marking a location makes it reviewed", () => {
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(false);
  tick(createLocation(4, 5));
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(true);
});

test("marks are kept on disk, shared by the repo's worktrees", () => {
  tick(createLocation(4, 5));
  const { hash } = getLocationView(createLocation(4, 5));
  const worktree = join(repo.dir, "../" + basename(repo.dir) + "-worktree");
  repo.git("worktree", "add", "-q", "--detach", worktree);
  // Another process, as another viewer would be, reading from the other worktree.
  const read = `import { readReview } from ${JSON.stringify(join(cwd, "src/review.ts"))}; console.log(readReview(${JSON.stringify(REVIEW)}).join())`;
  const fromWorktree = spawnSync(process.execPath, ["--input-type=module", "-e", read], { cwd: worktree, encoding: "utf8" });
  repo.git("worktree", "remove", "--force", worktree);
  expect(fromWorktree.stdout.trim()).toBe(hash);
});

test("code that only moved keeps its mark", () => {
  tick(createLocation(4, 5));
  writeLines("f.ts", ["new", "a", "b", "c", "d", "e"]); // a line added above
  expect(getLocationView(createLocation(5, 6)).reviewed).toBe(true);
});

test("code that changed loses its mark", () => {
  tick(createLocation(4, 5));
  writeLines("f.ts", ["a", "b", "c", "d", "E"]);
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(false);
});

test("code whose base changed loses its mark, though its own lines didn't change", () => {
  tick(createLocation(3, 5)); // c stays as it was in the base, d and e are added
  // a commit for the base with c changed, as after a rebase onto a main that changed it
  const blob = gitWithInput("a\nb\nX\n", "hash-object", "-w", "--stdin").trim();
  const tree = gitWithInput(`100644 blob ${blob}\tf.ts\n`, "mktree").trim();
  const rebasedBase = repo.git("commit-tree", tree, "-m", "base with c changed");
  expect(getLocationView(createLocation(3, 5), rebasedBase).reviewed).toBe(false);
});

test("a location cut differently is reviewed again, even inside what was marked", () => {
  tick(createLocation(3, 5));
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(false); // narrower
  expect(getLocationView(createLocation(2, 5)).reviewed).toBe(false); // wider
});

test("unmarking a location makes it unreviewed again", () => {
  tick(createLocation(4, 5));
  tick(createLocation(4, 5), false);
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(false);
  expect(readReview(REVIEW)).toEqual([]);
});

test("a tick on code that changed after it was shown marks only what was shown", () => {
  const shown = getLocationView(createLocation(4, 5)).hash;
  writeLines("f.ts", ["a", "b", "c", "d", "EDITED"]); // saved after the page showed the code
  mark(REVIEW, shown, true);
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(false);
  writeLines("f.ts", ["a", "b", "c", "d", "e"]); // back to what was shown
  expect(getLocationView(createLocation(4, 5)).reviewed).toBe(true);
});

test("base-side code (deleted lines) and files git doesn't track yet can be marked", () => {
  writeLines("f.ts", ["a", "c"]); // the PR deletes b instead
  writeLines("new.ts", ["x"]);
  tick(createLocation(2, 2, "f.ts", "LEFT"));
  tick(createLocation(1, 1, "new.ts"));
  expect(getLocationView(createLocation(2, 2, "f.ts", "LEFT")).reviewed).toBe(true);
  expect(getLocationView(createLocation(1, 1, "new.ts")).reviewed).toBe(true);
});

test("lines that can't be read have no hash, so nothing can be marked for them", () => {
  expect(getLocationView(createLocation(9, 9)).hash).toBe("");
  expect(getLocationView(createLocation(1, 1, "missing.ts")).hash).toBe("");
});

test("reviews are kept apart: a mark in one doesn't count in another", () => {
  tick(createLocation(4, 5));
  const { hash } = getLocationView(createLocation(4, 5));
  expect(readReview("other")).not.toContain(hash);
});

test("a review is named after the current branch", () => {
  expect(currentBranch()).toBe(repo.git("rev-parse", "--abbrev-ref", "HEAD"));
});

test("with no branch checked out, the viewer asks for a review name instead of starting", () => {
  const branch = currentBranch()!;
  repo.git("checkout", "-q", "--detach");
  const view = spawnSync(process.execPath, [join(cwd, "src/view.ts"), "graph.json", "--base", "HEAD"], { encoding: "utf8" });
  repo.git("checkout", "-q", branch);
  expect(view.status).toBe(2);
  expect(view.stderr).toContain("name the review with --review <name>");
});

test("a --head that isn't a branch can't name the review, so the viewer asks for one", () => {
  const view = spawnSync(process.execPath, [join(cwd, "src/view.ts"), "graph.json", "--base", "HEAD", "--head", "HEAD"], { encoding: "utf8" });
  expect(view.status).toBe(2);
  expect(view.stderr).toContain("HEAD isn't a branch: name the review with --review <name>");
});

test("a mark request needs a hash and whether it's reviewed", () => {
  expect(MarkRequest.safeParse({ hash: "d68710c7", reviewed: true }).success).toBe(true);
  expect(MarkRequest.safeParse({ reviewed: true }).success).toBe(false);
});
