// Review state: the hashes of the code marked reviewed, each the hash of a
// location's own rows of the diff, removed lines included, without line
// numbers (see codeFor). A location is reviewed when its hash is one of them,
// so moved code stays reviewed, and changed or re-cut code, or code whose
// base changed, doesn't.
//
// Each review has its own state, usually named after the branch being
// reviewed: the rows with its name in a SQLite database in the repo's common
// git dir, one row per hash, so worktrees share it and git never pushes it.
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { git } from "./git.ts";

/**
 * Runs a query on the reviews database, creating it if it doesn't exist yet. Each repo has its own file, so a row needs
 * no repo. A mark is only its review and its hash, so the table has nothing that should change shape; there are no
 * migrations, and an existing file is used as it is. If the shape ever has to change, whether old rows are converted
 * or dropped is decided then.
 */
function withReviews<T>(query: (db: DatabaseSync) => T): T {
  const dir = git("rev-parse", "--path-format=absolute", "--git-common-dir").trim();
  // Waits up to 5s for another viewer's write to finish rather than failing at once.
  const db = new DatabaseSync(join(dir, "unvibed-reviews.sqlite"), { timeout: 5000 });
  try {
    db.exec("CREATE TABLE IF NOT EXISTS reviewed (review TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (review, hash)) WITHOUT ROWID");
    return query(db);
  } finally {
    db.close();
  }
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

/** The hashes marked reviewed in a review. */
export function readReview(review: string): string[] {
  const rows = withReviews((db) => db.prepare("SELECT hash FROM reviewed WHERE review = ?").all(review));
  return rows.map((row) => row.hash as string);
}

/** Marks the lines with this hash reviewed, or not, in a review. */
export function mark(review: string, hash: string, reviewed: boolean): void {
  withReviews((db) =>
    db.prepare(reviewed ? "INSERT OR IGNORE INTO reviewed (review, hash) VALUES (?, ?)" : "DELETE FROM reviewed WHERE review = ? AND hash = ?").run(review, hash),
  );
}
