// Review state: the hashes of the code marked reviewed, each the hash of a
// location's own rows of the diff, removed lines included, without line
// numbers (see codeFor). A location is reviewed when its hash is one of them,
// so moved code stays reviewed, and changed or re-cut code, or code whose
// base changed, doesn't.
//
// Each review has its own state, usually named after the branch being
// reviewed: a JSON blob that refs/unvibed/reviews/<name> points at. Git
// doesn't push refs like these unless asked, and worktrees share them.
// refs/unvibed/reviews/ holds only review refs, named like branches, so, as
// with branches, git refuses a name that clashes with another (a and a/b).
// Format changes go in the JSON's version.
import { execFileSync } from "node:child_process";
import { git, gitWithInput } from "./git.ts";

export type ReviewState = { version: 1; reviewed: string[] };

const refOf = (review: string) => `refs/unvibed/reviews/${review}`;
const NO_REF = "0".repeat(40); // update-ref's "the ref must not exist yet"

/** The current branch, which names a review unless another name is given; undefined if no branch is checked out. */
export function currentBranch(): string | undefined {
  try {
    return git("symbolic-ref", "--short", "-q", "HEAD").trim();
  } catch {
    return undefined;
  }
}

/** Whether there's a local branch with this name. */
export const isBranch = (name: string) => {
  try {
    git("show-ref", "--verify", "-q", `refs/heads/${name}`);
    return true;
  } catch {
    return false;
  }
};

/** Whether git accepts this as a review's name. */
export const isReviewName = (review: string) => {
  try {
    git("check-ref-format", refOf(review));
    return true;
  } catch {
    return false;
  }
};

/** A review's state and the object its ref points at now (NO_REF when there's none yet). */
export function readReview(review: string): { state: ReviewState; at: string } {
  let at: string;
  try {
    at = git("rev-parse", "--verify", "-q", refOf(review)).trim();
  } catch {
    return { state: { version: 1, reviewed: [] }, at: NO_REF };
  }
  return { state: JSON.parse(git("cat-file", "blob", at)), at };
}

/** Creates the review's ref if it doesn't exist yet; throws git's message if git refuses the name (a next to a/b). */
export function createReview(review: string): void {
  const { state, at } = readReview(review);
  if (at === NO_REF) writeReview(review, state, at);
}

/**
 * Saves the state if the ref hasn't moved since it was read; false if it has (another mark landed). Other failures
 * throw git's message.
 */
function writeReview(review: string, state: ReviewState, at: string): boolean {
  const blob = gitWithInput(JSON.stringify(state, null, 2) + "\n", "hash-object", "-w", "--stdin").trim();
  try {
    execFileSync("git", ["update-ref", refOf(review), blob, at], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (e) {
    if (readReview(review).at !== at) return false;
    throw new Error((e as { stderr?: string }).stderr?.trim() || String(e));
  }
}

/** Marks the lines with this hash reviewed, or not, in a review; retries if another mark lands at the same time. */
export function mark(review: string, hash: string, reviewed: boolean): void {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, at } = readReview(review);
    const hashes = new Set(state.reviewed);
    if (reviewed) hashes.add(hash);
    else hashes.delete(hash);
    if (writeReview(review, { version: 1, reviewed: [...hashes] }, at)) return;
  }
  throw new Error("couldn't save the mark: other marks kept landing at the same time");
}
