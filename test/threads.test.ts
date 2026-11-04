import { rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { createTables } from "../src/db.ts";
import {
  addMessage,
  addSummaryVersion,
  deleteThread,
  dropThread,
  firstQuestion,
  getThread,
  messagesOf,
  moveThread,
  setSession,
  startThread,
  summaryOf,
  threadsOf,
} from "../src/threads.ts";
import type { Anchor, Thread } from "../shared/thread.ts";
import { inTempRepo } from "./in-temp-repo.ts";

// Threads in a real repo's database, as the CLI and the viewer keep them.

const getRepo = inTempRepo();
const REVIEW = "pr";

// Each test starts with no threads.
beforeEach(() => {
  rmSync(join(getRepo().dir, ".git/unvibed.sqlite"), { force: true });
  createTables();
});

const onNode = (quote = "Marks"): Anchor => ({ in: "node-text", nodeId: randomUUID(), start: 0, end: quote.length, quote });
const start = (anchor: Anchor = onNode(), review = REVIEW) => startThread({ review, anchor, base: "base-sha", head: null });

/** A thread with a question and an answer, and a thread anchored on the answer's first word. */
function nested(outer: Thread = start()) {
  addMessage(outer.id, "user", "Why are marks kept by hash?");
  const answer = addMessage(outer.id, "assistant", "Because moved code keeps its hash.");
  const inner = start({ in: "message", threadId: outer.id, seq: answer.seq, start: 0, end: 7, quote: "Because" });
  return { outer, inner };
}

test("a thread is kept with its anchor and commits, and nothing else yet", () => {
  const anchor: Anchor = { in: "code", path: "f.ts", side: "LEFT", startLine: 2, endLine: 3, start: 1, end: 4, quote: "o\nt" };
  const thread = startThread({ review: REVIEW, anchor, base: "base-sha", head: "head-sha" });
  expect(getThread(thread.id)).toEqual(thread);
  expect(thread).toMatchObject({ anchor, base: "base-sha", head: "head-sha", sessionId: null, dropped: null });
  setSession(thread.id, "session-1");
  expect(getThread(thread.id)?.sessionId).toBe("session-1");
});

test("a review's threads are its own, oldest first", () => {
  const first = start();
  start(onNode(), "other");
  const second = start();
  expect(threadsOf(REVIEW).map((t) => t.id)).toEqual([first.id, second.id]);
});

test("messages go in order, and the first question is the user's first message", () => {
  const thread = start();
  expect(firstQuestion(thread.id)).toBeUndefined();
  addMessage(thread.id, "user", "What is this?");
  addMessage(thread.id, "assistant", "A hash.");
  addMessage(thread.id, "user", "Of what?");
  expect(messagesOf(thread.id)).toEqual([
    { threadId: thread.id, seq: 0, role: "user", text: "What is this?" },
    { threadId: thread.id, seq: 1, role: "assistant", text: "A hash." },
    { threadId: thread.id, seq: 2, role: "user", text: "Of what?" },
  ]);
  expect(firstQuestion(thread.id)).toBe("What is this?");
});

test("the highest summary version is the summary", () => {
  const thread = start();
  expect(summaryOf(thread.id)).toBeUndefined();
  addSummaryVersion({ threadId: thread.id, text: "Marks are by hash.", by: "claude", upTo: 1, prompt: null });
  const edited = addSummaryVersion({ threadId: thread.id, text: "Marks are by hash of the rows.", by: "you", upTo: 1, prompt: null });
  expect(edited.version).toBe(2);
  expect(summaryOf(thread.id)).toEqual(edited);
});

test("nothing can be added to a thread that isn't there", () => {
  expect(() => addMessage(randomUUID(), "user", "?")).toThrow(/no thread/);
  expect(() => addSummaryVersion({ threadId: randomUUID(), text: "", by: "you", upTo: 0, prompt: null })).toThrow(/no thread/);
});

test("a thread starts in another thread's message or summary only where that text holds its quote", () => {
  const { outer } = nested();
  expect(() => start({ in: "message", threadId: outer.id, seq: 1, start: 0, end: 7, quote: "Becuase" })).toThrow(/quote-mismatch/);
  expect(() => start({ in: "message", threadId: outer.id, seq: 5, start: 0, end: 1, quote: "B" })).toThrow(/has no message 5/);
  expect(() => start({ in: "summary", threadId: outer.id, start: 0, end: 1, quote: "M" })).toThrow(/has no summary/);
  addSummaryVersion({ threadId: outer.id, text: "Marks are by hash.", by: "claude", upTo: 1, prompt: null });
  expect(start({ in: "summary", threadId: outer.id, start: 0, end: 5, quote: "Marks" }).anchor.in).toBe("summary");
  // a thread of another review can't hold it
  expect(() => start({ in: "message", threadId: outer.id, seq: 1, start: 0, end: 7, quote: "Because" }, "other")).toThrow(/no thread .* in review other/);
});

test("deleting a thread deletes everything inside it, to any depth, and nothing else", () => {
  const { outer, inner } = nested();
  addSummaryVersion({ threadId: inner.id, text: "Moved code keeps its hash.", by: "claude", upTo: 0, prompt: null });
  const innermost = start({ in: "summary", threadId: inner.id, start: 0, end: 10, quote: "Moved code" });
  addMessage(innermost.id, "user", "Moved how?");
  const beside = start();
  addMessage(beside.id, "user", "Unrelated?");

  deleteThread(outer.id);
  for (const id of [outer.id, inner.id, innermost.id]) {
    expect(getThread(id)).toBeUndefined();
    expect(messagesOf(id)).toEqual([]);
    expect(summaryOf(id)).toBeUndefined();
  }
  expect(threadsOf(REVIEW)).toEqual([beside]);
  expect(messagesOf(beside.id)).toHaveLength(1);
});

test("deleting a thread inside another leaves the outer one", () => {
  const { outer, inner } = nested();
  deleteThread(inner.id);
  expect(threadsOf(REVIEW).map((t) => t.id)).toEqual([outer.id]);
  expect(messagesOf(outer.id)).toHaveLength(2);
});

test("moving a thread changes only its anchor", () => {
  const thread = start();
  addMessage(thread.id, "user", "Why?");
  const anchor: Anchor = { in: "location-text", locationId: randomUUID(), start: 4, end: 8, quote: "hash" };
  moveThread(thread.id, anchor);
  expect(getThread(thread.id)).toEqual({ ...thread, anchor });
  expect(firstQuestion(thread.id)).toBe("Why?");
});

test("a thread moves into another thread only where it's in place, and never into itself or a thread inside it", () => {
  const { outer, inner } = nested();
  const other = nested();
  const answer = { in: "message", seq: 1, start: 0, end: 7, quote: "Because" } as const;
  expect(() => moveThread(inner.id, { ...answer, threadId: other.outer.id, quote: "because" })).toThrow(/quote-mismatch/);
  moveThread(inner.id, { ...answer, threadId: other.outer.id });
  expect(getThread(inner.id)?.anchor).toMatchObject({ threadId: other.outer.id });

  expect(() => moveThread(outer.id, { ...answer, threadId: outer.id })).toThrow(/can't hold it/);
  moveThread(inner.id, { ...answer, threadId: outer.id }); // back where it was
  addMessage(inner.id, "user", "x?");
  expect(() => moveThread(outer.id, { in: "message", threadId: inner.id, seq: 0, start: 0, end: 1, quote: "x" })).toThrow(/can't hold it/);
});

test("dropping a thread keeps it, with why and when", () => {
  const thread = start();
  dropThread(thread.id, "the node it asked about was merged into another");
  expect(getThread(thread.id)?.dropped).toEqual({ reason: "the node it asked about was merged into another", at: expect.any(Number) });
  expect(() => dropThread(thread.id, "  ")).toThrow(/say why/);
});

test("a thread that isn't there can't be moved or dropped", () => {
  expect(() => moveThread(randomUUID(), onNode())).toThrow(/no thread/);
  expect(() => dropThread(randomUUID(), "gone")).toThrow(/no thread/);
});
