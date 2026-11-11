// Review state: the hashes of the code marked reviewed, each the hash of a
// location's own rows of the diff, removed lines included, without line
// numbers (see cutFor). A location is reviewed when its hash is one of them,
// so moved code stays reviewed, and changed or re-cut code, or code whose
// base changed, doesn't.
//
// Each review has its own state, usually named after the branch being
// reviewed: the rows with its name in unvibed's database (db.ts), one row per
// hash.
import { db } from "./db.ts";
import { git } from "./git.ts";

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

/** Whether the lines with this hash are marked reviewed in a review. */
export function isReviewed(review: string, hash: string): boolean {
  return db.prepare("SELECT 1 FROM reviewed WHERE review = ? AND hash = ?").get(review, hash) !== undefined;
}

/** Marks the lines with this hash reviewed, or not, in a review. */
export function mark(review: string, hash: string, reviewed: boolean): void {
  if (reviewed) db.prepare("INSERT OR IGNORE INTO reviewed (review, hash) VALUES (?, ?)").run(review, hash);
  else db.prepare("DELETE FROM reviewed WHERE review = ? AND hash = ?").run(review, hash);
}

/** Unmarks everything in a review. */
export function clearReview(review: string): void {
  db.prepare("DELETE FROM reviewed WHERE review = ?").run(review);
}
