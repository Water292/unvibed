import { z } from "zod";

/** A selection in a piece of text. */
export type Range = {
  /** Character offset where the selection starts. */
  start: number;
  /** Character offset where it ends (exclusive). */
  end: number;
  /** The selected text, as it was. */
  quote: string;
};

/**
 * Where a thread was started. A code anchor's offsets are into lines startLine..endLine of that file on that side,
 * joined with "\n". Threads nest to any depth through message and summary anchors.
 */
export type Anchor =
  | ({ in: "node-title" | "node-text"; nodeId: string } & Range)
  | ({ in: "edge-note"; edgeId: string } & Range)
  | ({ in: "location-text"; locationId: string } & Range)
  | ({ in: "code"; path: string; side: "LEFT" | "RIGHT"; startLine: number; endLine: number } & Range)
  | ({ in: "message"; threadId: string; seq: number } & Range)
  | ({ in: "summary"; threadId: string } & Range);

const offset = z.int().min(0);
const range = { start: offset, end: offset, quote: z.string() };
const line = z.int().min(1);

/** An anchor as given from outside (the CLI, later the page): its shape only, not whether it's in place. */
export const Anchor: z.ZodType<Anchor> = z.discriminatedUnion("in", [
  z.strictObject({ in: z.literal("node-title"), nodeId: z.string(), ...range }),
  z.strictObject({ in: z.literal("node-text"), nodeId: z.string(), ...range }),
  z.strictObject({ in: z.literal("edge-note"), edgeId: z.string(), ...range }),
  z.strictObject({ in: z.literal("location-text"), locationId: z.string(), ...range }),
  z.strictObject({ in: z.literal("code"), path: z.string(), side: z.enum(["LEFT", "RIGHT"]), startLine: line, endLine: line, ...range }),
  z.strictObject({ in: z.literal("message"), threadId: z.string(), seq: z.int().min(0), ...range }),
  z.strictObject({ in: z.literal("summary"), threadId: z.string(), ...range }),
]);

export type Thread = {
  /** A UUID. */
  id: string;
  review: string;
  anchor: Anchor;
  /** The commit the review's base was at when the thread was started. */
  base: string;
  /** The head commit then; null when the head was the working tree. */
  head: string | null;
  /** The Claude Code session behind its answers. */
  sessionId: string | null;
  createdAt: number;
  /** Set when the AI decided it no longer applies. */
  dropped: { reason: string; at: number } | null;
};

export type Message = { threadId: string; seq: number; role: "user" | "assistant"; text: string };

/** One version of a thread's summary. The highest version is the summary. */
export type SummaryVersion = {
  threadId: string;
  version: number;
  text: string;
  by: "claude" | "you";
  /** seq of the thread's last message when this version was made. */
  upTo: number;
  /** The user's free-form instructions for Claude's write; null for a plain summary or a hand edit. */
  prompt: string | null;
  at: number;
};
