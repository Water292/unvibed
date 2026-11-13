// Review state: the hashes of the code marked reviewed, each the hash of a
// location's own rows of the diff, removed lines included, without line
// numbers (see cutFor). A location is reviewed when its hash is one of them,
// so moved code stays reviewed, and changed or re-cut code, or code whose
// base changed, doesn't.
//
// Each review has its own state, usually named after the branch being
// reviewed: the rows with its name in a SQLite database in the repo's common
// git dir, one row per hash, so worktrees share it and git never pushes it.
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { git } from "./git.ts";

let db: DatabaseSync;

/** Opens unvibed's database in the repo's common git dir and creates its tables if they don't exist yet. */
export function createTables(): void {
  const dir = git("rev-parse", "--path-format=absolute", "--git-common-dir").trim();
  // Waits up to 5s for another viewer's write to finish rather than failing at once.
  db = new DatabaseSync(join(dir, "unvibed.sqlite"), { timeout: 5000 });
  // Schema versioning is deferred.
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviewed (
      review TEXT NOT NULL,
      hash TEXT NOT NULL,
      PRIMARY KEY (review, hash)
    ) WITHOUT ROWID
  `);
}

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
