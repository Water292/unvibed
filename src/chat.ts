// Chat threads about any text in the viewer, answered by Claude Code run
// headless (claude -p) in the repo with read-only tools. A thread starts at a
// quote: from a node's explanation, a location's explanation or code, or an
// answer in another thread, which makes it a child of that thread and starts
// it as a fork of that thread's Claude session, so it knows what was said.
// A root thread starts fresh, or as a fork of the session --chat-from names,
// as /btw asks a side question of a session. Each thread's messages, its
// Claude session and its summary are kept together in unvibed's SQLite
// database, by review.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { git } from "./git.ts";

let db: DatabaseSync;

export function createChatTables(): void {
  const dir = git("rev-parse", "--path-format=absolute", "--git-common-dir").trim();
  db = new DatabaseSync(join(dir, "unvibed.sqlite"), { timeout: 5000 });
  db.exec(`
    CREATE TABLE IF NOT EXISTS vibe_threads_v1 (
      id TEXT PRIMARY KEY,
      review TEXT NOT NULL,
      parent_id TEXT,
      anchor TEXT NOT NULL,
      quote TEXT NOT NULL,
      context TEXT NOT NULL,
      session_id TEXT,
      summary TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vibe_messages_v1 (
      thread_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (thread_id, seq)
    );
  `);
  // where in its text the quote starts, so a phrase that shows up twice is underlined at the right one
  // staged_at: when it was staged to send to the main chat (null = not staged); instruction: what to do with it;
  // sent_at: when it was last sent
  for (const column of ["quote_offset INTEGER NOT NULL DEFAULT 0", "staged_at INTEGER", "instruction TEXT", "sent_at INTEGER"])
    try {
      db.exec(`ALTER TABLE vibe_threads_v1 ADD COLUMN ${column}`);
    } catch {} // already there
}

import type { ChatEvent, Message, Thread } from "../shared/chat.ts";
import type { Graph } from "../shared/graph.ts";

type ThreadRow = {
  id: string;
  parent_id: string | null;
  anchor: string;
  quote: string;
  quote_offset: number;
  context: string;
  session_id: string | null;
  summary: string | null;
  staged_at: number | null;
  instruction: string | null;
  sent_at: number | null;
};

const toThread = (r: ThreadRow): Thread => ({
  id: r.id,
  parentId: r.parent_id,
  anchor: r.anchor,
  quote: r.quote,
  quoteOffset: r.quote_offset,
  stagedAt: r.staged_at,
  instruction: r.instruction,
  sentAt: r.sent_at,
  context: r.context,
  sessionId: r.session_id,
  summary: r.summary,
  messages: db.prepare("SELECT role, text FROM vibe_messages_v1 WHERE thread_id = ? ORDER BY seq").all(r.id) as Message[],
});

export function threads(review: string): Thread[] {
  return (db.prepare("SELECT * FROM vibe_threads_v1 WHERE review = ? ORDER BY created_at").all(review) as ThreadRow[]).map(toThread);
}

function thread(id: string): Thread | undefined {
  const r = db.prepare("SELECT * FROM vibe_threads_v1 WHERE id = ?").get(id) as ThreadRow | undefined;
  return r && toThread(r);
}

function addMessage(threadId: string, role: Message["role"], text: string) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM vibe_messages_v1 WHERE thread_id = ?").get(threadId) as { n: number };
  db.prepare("INSERT INTO vibe_messages_v1 (thread_id, seq, role, text) VALUES (?, ?, ?, ?)").run(threadId, n, role, text);
}

/** claude: $UNVIBED_CLAUDE, else on PATH, else the newest one the Claude desktop app ships. */
export function claudeBin(): string {
  if (process.env.UNVIBED_CLAUDE) return process.env.UNVIBED_CLAUDE;
  for (const dir of (process.env.PATH ?? "").split(":")) if (dir && existsSync(join(dir, "claude"))) return join(dir, "claude");
  const root = join(homedir(), "Library/Application Support/Claude/claude-code");
  if (existsSync(root)) {
    const versions = readdirSync(root).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse();
    for (const v of versions)
      for (const build of readdirSync(join(root, v))) {
        const bin = join(root, v, build, "claude.app/Contents/MacOS/claude");
        if (existsSync(bin)) return bin;
      }
  }
  return "claude";
}

/** The folder a Claude Code session ran in, which resuming it needs; undefined if its transcript isn't found. */
export function sessionCwd(sessionId: string): string | undefined {
  const projects = join(homedir(), ".claude/projects");
  if (!existsSync(projects)) return undefined;
  for (const p of readdirSync(projects)) {
    const file = join(projects, p, `${sessionId}.jsonl`);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      try {
        const cwd = JSON.parse(line).cwd;
        if (typeof cwd === "string") return cwd;
      } catch {}
    }
  }
  return undefined;
}

export type ChatSetup = { base: string; head: string | undefined; graphPath: string; repo: string; chatFrom: string | undefined };

const SYSTEM = `You are answering questions from a code reviewer inside unvibed, a viewer that shows a PR as a graph of explained nodes, each pointing at code locations. The reviewer selected some text in the viewer and asked about it. Answer directly and briefly (a few short paragraphs at most), in plain language, citing file:line where it helps. You can read the repo with Read, Grep, Glob and git show/diff/log/grep; do not modify anything.`;


/** Runs claude -p once, calling onEvent as it goes; resolves with the answer and the session it's in. */
function runClaude(prompt: string, resume: { id: string; fork: boolean } | undefined, cwd: string, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<{ text: string; sessionId: string | null; error?: string }> {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--allowedTools",
    "Read",
    "Grep",
    "Glob",
    "Bash(git show:*)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
    "Bash(git grep:*)",
    "--append-system-prompt",
    SYSTEM,
  ];
  if (resume) args.push("--resume", resume.id, ...(resume.fork ? ["--fork-session"] : []));
  // not as a session nested in whichever Claude Code session started the viewer
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "CLAUDECODE" && !k.startsWith("CLAUDE_CODE_")));
  const child = spawn(claudeBin(), args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], signal });
  let buffer = "";
  let text = "";
  let sessionId: string | null = null;
  let error: string | undefined;
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.stdout.on("data", (d: Buffer) => {
    buffer += d.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.session_id) sessionId = m.session_id;
      if (m.type === "stream_event" && m.event?.type === "content_block_delta" && m.event.delta?.type === "text_delta") {
        onEvent({ t: "delta", text: m.event.delta.text });
      } else if (m.type === "stream_event" && m.event?.type === "message_start" && text) {
        onEvent({ t: "delta", text: "\n\n" }); // a new turn after a tool call starts a new paragraph
      } else if (m.type === "assistant") {
        for (const c of m.message?.content ?? []) {
          if (c.type === "tool_use") onEvent({ t: "tool", name: c.name, detail: String(c.input?.file_path ?? c.input?.pattern ?? c.input?.command ?? "") });
          if (c.type === "text") text += (text ? "\n\n" : "") + c.text;
        }
      } else if (m.type === "result") {
        if (m.is_error) error = String(m.result || m.subtype || "claude failed");
        else if (typeof m.result === "string" && m.result) text = m.result;
      }
    }
  });
  return new Promise((resolve) => {
    child.on("error", (e) => resolve({ text, sessionId, error: `can't run claude (${claudeBin()}): ${e.message}` }));
    child.on("close", (code) => resolve({ text, sessionId, error: error ?? (code ? stderr.trim() || `claude exited with ${code}` : undefined) }));
  });
}

export type StartRequest = { threadId: string; parentId?: string; anchor: string; quote: string; quoteOffset: number; context: string };
export type ChatRequest = StartRequest & { message: string };

/** Keeps a new thread, before anything is asked in it, so it survives a reload; a thread already kept is left as is. */
export function startThread(review: string, req: StartRequest): void {
  db.prepare("INSERT OR IGNORE INTO vibe_threads_v1 (id, review, parent_id, anchor, quote, quote_offset, context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    req.threadId,
    review,
    req.parentId ?? null,
    req.anchor,
    req.quote,
    req.quoteOffset ?? 0,
    req.context,
    Date.now(),
  );
}

/** Adds the reviewer's message to a thread (making the thread if it's new), runs Claude on it and records the answer. */
export async function chat(review: string, setup: ChatSetup, req: ChatRequest, onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  startThread(review, req);
  const t = thread(req.threadId)!;
  // the first question carries the quote and where it is
  const first = t.messages.length === 0;
  addMessage(t.id, "user", req.message);
  const parent = t.parentId ? thread(t.parentId) : undefined;
  // a thread goes on in its own session; a new one forks its parent's, else --chat-from's, else starts fresh
  const resume = t.sessionId
    ? { id: t.sessionId, fork: false }
    : parent?.sessionId
      ? { id: parent.sessionId, fork: true }
      : setup.chatFrom
        ? { id: setup.chatFrom, fork: true }
        : undefined;
  const cwd = resume ? sessionCwdOr(resume.id, setup.repo) : setup.repo;
  const prompt = first
    ? [
        `The reviewer is looking at the PR from ${setup.base} to ${setup.head ?? "the working tree"} in ${setup.repo}, explained by the graph in ${setup.graphPath}.`,
        // the checkout may be on another branch than the one reviewed, so line numbers from it would be wrong
        setup.head
          ? `The code under review is at commit ${setup.head}, not the working tree, which may hold other code. Read files with \`git show ${setup.head}:<path>\` and the change with \`git diff ${setup.base} ${setup.head}\`; cite line numbers as they are at ${setup.head}.`
          : "",
        parent ? "They selected text from your earlier answer in this conversation." : "",
        `Where the selection is: ${req.context}`,
        `They selected: «${req.quote}»`,
        `Their question: ${req.message}`,
      ]
        .filter(Boolean)
        .join("\n\n")
    : req.message;
  const result = await runClaude(prompt, resume, cwd, onEvent, signal);
  if (result.sessionId) db.prepare("UPDATE vibe_threads_v1 SET session_id = ? WHERE id = ?").run(result.sessionId, t.id);
  if (result.error && !result.text) {
    onEvent({ t: "error", message: result.error });
    addMessage(t.id, "assistant", `⚠ ${result.error}`);
    return;
  }
  addMessage(t.id, "assistant", result.text);
  onEvent({ t: "done", text: result.text, sessionId: result.sessionId });
}

/** A session's own folder, which --resume looks it up by, else the repo. */
const sessionCwdOr = (id: string, repo: string) => sessionCwd(id) ?? repo;

/** Asks Claude, in a fork of the thread's session, to sum the thread up, and keeps the summary with the thread. */
export async function summarize(threadId: string, repo: string, signal: AbortSignal): Promise<{ summary?: string; error?: string }> {
  const t = thread(threadId);
  if (!t) return { error: "no such thread" };
  if (!t.sessionId) return { error: "this thread has no answer to summarize yet" };
  const result = await runClaude(
    "Summarize this conversation for the reviewer's notes: the question, what we found, and anything left open. Two to four sentences, no preamble.",
    { id: t.sessionId, fork: true },
    sessionCwdOr(t.sessionId, repo),
    () => {},
    signal,
  );
  if (!result.text) return { error: result.error ?? "no summary came back" };
  db.prepare("UPDATE vibe_threads_v1 SET summary = ? WHERE id = ?").run(result.text, threadId);
  return { summary: result.text };
}

/** Removes a thread and every thread under it. */
export function deleteThread(id: string): void {
  for (const child of db.prepare("SELECT id FROM vibe_threads_v1 WHERE parent_id = ?").all(id) as { id: string }[]) deleteThread(child.id);
  db.prepare("DELETE FROM vibe_messages_v1 WHERE thread_id = ?").run(id);
  db.prepare("DELETE FROM vibe_threads_v1 WHERE id = ?").run(id);
}

/** Stages a thread to send to the main chat, with what to do about it (null: nothing said), or unstages it. */
export function stage(id: string, staged: boolean, instruction: string | null): void {
  if (staged) db.prepare("UPDATE vibe_threads_v1 SET staged_at = COALESCE(staged_at, ?), instruction = ? WHERE id = ?").run(Date.now(), instruction, id);
  else db.prepare("UPDATE vibe_threads_v1 SET staged_at = NULL, instruction = NULL WHERE id = ?").run(id);
}

/** Marks staged threads sent: they leave the staged list and remember when they went. */
export function markSent(ids: string[]): void {
  const now = Date.now();
  for (const id of ids) db.prepare("UPDATE vibe_threads_v1 SET staged_at = NULL, sent_at = ? WHERE id = ?").run(now, id);
}

/** A node and, for a location anchor, the location, an anchor points into; walks up through threads to the text. */
function placeOf(anchor: string, graph: Graph): string {
  const [kind, rest = ""] = anchor.split(/:(.*)/s);
  if (kind === "thread") {
    const parent = thread(rest.split("#")[0]!);
    return parent ? placeOf(parent.anchor, graph) : "an earlier thread";
  }
  const [nodeId, index] = kind === "loc" ? rest.split("#") : [rest, undefined];
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return `node ${nodeId}`;
  const at = `node ${node.id} ("${node.title}")`;
  const l = index === undefined ? undefined : node.code[Number(index)];
  if (!l) return at;
  const start = l.start_line ?? l.line;
  return `${at}, ${l.path}:${start}${start !== l.line ? `-${l.line}` : ""} (${l.side === "LEFT" ? "base" : "head"} side)`;
}

const indent = (text: string, pad: string) => text.trim().split("\n").join(`\n${pad}`);

/** The staged threads, oldest first, as one block to paste into the main chat: for each, what to do, where, and what was asked and answered. */
export function stagedText(review: string, graph: Graph, setup: ChatSetup): { ids: string[]; text: string } {
  const staged = threads(review)
    .filter((t) => t.stagedAt !== null)
    .sort((a, b) => a.stagedAt! - b.stagedAt!);
  if (!staged.length) return { ids: [], text: "" };
  const pad = "   ";
  const items = staged.map((t, i) => {
    const lines = [`${i + 1}. ${t.instruction ?? "(no instruction)"}`, `${pad}Where: ${placeOf(t.anchor, graph)}`, `${pad}Selected: "${t.quote}"`];
    const parent = t.parentId ? thread(t.parentId) : undefined;
    if (parent?.messages[0]) lines.push(`${pad}Following up on: ${indent(parent.messages[0].text, pad)}`);
    if (t.summary) lines.push(`${pad}Summary of the thread: ${indent(t.summary, pad)}`);
    else
      for (const m of t.messages) lines.push(`${pad}${m.role === "user" ? "Q" : "A"}: ${indent(m.text, pad + "   ")}`);
    return lines.join("\n");
  });
  const head = `Review notes from the unvibed viewer on ${setup.base.slice(0, 7)}..${setup.head?.slice(0, 7) ?? "the working tree"} (graph ${setup.graphPath}). Each note is a thread I had about the code, with what I want done:`;
  return { ids: staged.map((t) => t.id), text: [head, ...items].join("\n\n") };
}
