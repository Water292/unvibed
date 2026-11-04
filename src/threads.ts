// Review chat threads, kept by review in unvibed's database (db.ts). A thread
// starts at an anchor, a selection in the graph's text, in code, or in a
// message or the summary of another thread, which nests it inside that one,
// to any depth. It holds its messages and the versions of its summary.
//
// graph check --review checks threads anchored on the graph and its code, as
// the graph is rewritten. Threads anchored in other threads aren't checked
// there, so starting or moving one checks that it's in place.
import { randomUUID } from "node:crypto";
import { db } from "./db.ts";
import { place } from "./place.ts";
import type { Anchor, Message, SummaryVersion, Thread } from "../shared/thread.ts";

type ThreadRow = {
  id: string;
  review: string;
  anchor: string;
  base: string;
  head: string | null;
  session_id: string | null;
  created_at: number;
  dropped_reason: string | null;
  dropped_at: number | null;
};

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  review: r.review,
  anchor: JSON.parse(r.anchor),
  base: r.base,
  head: r.head,
  sessionId: r.session_id,
  createdAt: r.created_at,
  dropped: r.dropped_reason === null ? null : { reason: r.dropped_reason, at: r.dropped_at! },
});

export function getThread(id: string): Thread | undefined {
  const r = db.prepare("SELECT * FROM threads WHERE id = ?").get(id) as ThreadRow | undefined;
  return r && toThread(r);
}

/** A review's threads, oldest first, dropped ones included. */
export function threadsOf(review: string): Thread[] {
  return (db.prepare("SELECT * FROM threads WHERE review = ? ORDER BY created_at, rowid").all(review) as ThreadRow[]).map(toThread);
}

/** A thread and every thread inside it: anchored on its messages or summary, or inside one of those, to any depth. */
function insideOf(id: string): string[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE inside(id) AS (
         SELECT ?
         UNION
         SELECT threads.id FROM threads JOIN inside ON json_extract(threads.anchor, '$.threadId') = inside.id
       )
       SELECT id FROM inside`,
    )
    .all(id) as { id: string }[];
  return rows.map((r) => r.id);
}

/**
 * Throws unless an anchor in another thread can hold a thread of this review: that thread is in the same review, isn't
 * this thread or inside it, and its message or summary is there and holds the anchor's quote at start..end.
 * Anchors on the graph and its code are left to graph check.
 */
function checkNested(id: string, review: string, anchor: Anchor): void {
  if (anchor.in !== "message" && anchor.in !== "summary") return;
  const outer = getThread(anchor.threadId);
  if (!outer || outer.review !== review) throw new Error(`no thread ${anchor.threadId} in review ${review}`);
  if (insideOf(id).includes(outer.id)) throw new Error(`thread ${outer.id} is thread ${id} or inside it, so it can't hold it`);
  const text = anchor.in === "message" ? messagesOf(outer.id).find((m) => m.seq === anchor.seq)?.text : summaryOf(outer.id)?.text;
  if (text === undefined) throw new Error(anchor.in === "message" ? `thread ${outer.id} has no message ${anchor.seq}` : `thread ${outer.id} has no summary`);
  const placed = place(anchor, text);
  if (!placed.ok) throw new Error(`${placed.reason}: the text at ${anchor.start}..${anchor.end} is ${JSON.stringify(placed.now)}, not ${JSON.stringify(anchor.quote)}`);
}

/** Starts a thread, with no messages yet. */
export function startThread(t: Pick<Thread, "review" | "anchor" | "base" | "head">): Thread {
  const thread: Thread = { ...t, id: randomUUID(), sessionId: null, createdAt: Date.now(), dropped: null };
  checkNested(thread.id, thread.review, thread.anchor);
  db.prepare("INSERT INTO threads (id, review, anchor, base, head, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    thread.id,
    thread.review,
    JSON.stringify(thread.anchor),
    thread.base,
    thread.head,
    thread.createdAt,
  );
  return thread;
}

/** Throws unless there's a thread with this id. */
function existing(id: string): Thread {
  const thread = getThread(id);
  if (!thread) throw new Error(`no thread ${id}`);
  return thread;
}

/** Records the Claude Code session behind a thread's answers. */
export function setSession(id: string, sessionId: string): void {
  existing(id);
  db.prepare("UPDATE threads SET session_id = ? WHERE id = ?").run(sessionId, id);
}

/** Moves a thread to another anchor; one in another thread must be in place, one on the graph is checked by graph check. */
export function moveThread(id: string, anchor: Anchor): void {
  const thread = existing(id);
  checkNested(id, thread.review, anchor);
  db.prepare("UPDATE threads SET anchor = ? WHERE id = ?").run(JSON.stringify(anchor), id);
}

/** Marks a thread as no longer applying, and why; graph check then leaves it alone. */
export function dropThread(id: string, reason: string): void {
  existing(id);
  if (!reason.trim()) throw new Error("say why the thread is dropped");
  db.prepare("UPDATE threads SET dropped_reason = ?, dropped_at = ? WHERE id = ?").run(reason, Date.now(), id);
}

/** Deletes a thread and everything inside it: its messages and summary, and the threads inside it, theirs too. */
export function deleteThread(id: string): void {
  const ids = JSON.stringify(insideOf(id));
  db.exec("BEGIN");
  try {
    for (const table of ["messages", "summary_versions"]) db.prepare(`DELETE FROM ${table} WHERE thread_id IN (SELECT value FROM json_each(?))`).run(ids);
    db.prepare("DELETE FROM threads WHERE id IN (SELECT value FROM json_each(?))").run(ids);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Adds a message after a thread's last one. */
export function addMessage(threadId: string, role: Message["role"], text: string): Message {
  existing(threadId);
  const { seq } = db.prepare("SELECT COALESCE(MAX(seq) + 1, 0) AS seq FROM messages WHERE thread_id = ?").get(threadId) as { seq: number };
  db.prepare("INSERT INTO messages (thread_id, seq, role, text) VALUES (?, ?, ?, ?)").run(threadId, seq, role, text);
  return { threadId, seq, role, text };
}

export function messagesOf(threadId: string): Message[] {
  return db.prepare("SELECT thread_id AS threadId, seq, role, text FROM messages WHERE thread_id = ? ORDER BY seq").all(threadId) as Message[];
}

/** The first thing the user asked in a thread; undefined before they've asked anything. */
export function firstQuestion(threadId: string): string | undefined {
  const r = db.prepare("SELECT text FROM messages WHERE thread_id = ? AND role = 'user' ORDER BY seq LIMIT 1").get(threadId) as { text: string } | undefined;
  return r?.text;
}

/** Adds a version of a thread's summary, after its highest, which makes it the summary. */
export function addSummaryVersion(v: Omit<SummaryVersion, "version" | "at">): SummaryVersion {
  existing(v.threadId);
  const { version } = db.prepare("SELECT COALESCE(MAX(version) + 1, 1) AS version FROM summary_versions WHERE thread_id = ?").get(v.threadId) as { version: number };
  const added: SummaryVersion = { ...v, version, at: Date.now() };
  db.prepare("INSERT INTO summary_versions (thread_id, version, text, by, up_to, prompt, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    added.threadId,
    added.version,
    added.text,
    added.by,
    added.upTo,
    added.prompt,
    added.at,
  );
  return added;
}

/** A thread's summary: its highest version; undefined if it has none. */
export function summaryOf(threadId: string): SummaryVersion | undefined {
  return db
    .prepare("SELECT thread_id AS threadId, version, text, by, up_to AS upTo, prompt, at FROM summary_versions WHERE thread_id = ? ORDER BY version DESC LIMIT 1")
    .get(threadId) as SummaryVersion | undefined;
}
