// unvibed's SQLite database, in the repo's common git dir, so worktrees share
// it and git never pushes it: review marks (review.ts) and review chat
// threads (threads.ts).
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { git } from "./git.ts";

export let db: DatabaseSync;

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
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      review TEXT NOT NULL,
      anchor TEXT NOT NULL, -- an Anchor, as JSON
      base TEXT NOT NULL,
      head TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL,
      dropped_reason TEXT, -- dropped_reason and dropped_at are both set, or neither
      dropped_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS threads_by_review ON threads (review);
    CREATE TABLE IF NOT EXISTS messages (
      thread_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (thread_id, seq)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS summary_versions (
      thread_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      text TEXT NOT NULL,
      by TEXT NOT NULL,
      up_to INTEGER NOT NULL,
      prompt TEXT,
      at INTEGER NOT NULL,
      PRIMARY KEY (thread_id, version)
    ) WITHOUT ROWID
  `);
}
