// A chat thread as the server keeps it and the page draws it (src/chat.ts).
export type Message = { role: "user" | "assistant"; text: string };
export type Thread = {
  id: string;
  /** The thread whose answer this one's quote was selected from. */
  parentId: string | null;
  /** Where the quote was selected: node:<id>, loc:<nodeId>#<index>, or thread:<id>#<message index>. */
  anchor: string;
  quote: string;
  /** Where the quote starts in its text, counted with each run of whitespace as one space. */
  quoteOffset: number;
  /** What the selection was in, told to Claude with the first question. */
  context: string;
  sessionId: string | null;
  summary: string | null;
  /** When it was staged to send to the main chat; null when it isn't. */
  stagedAt: number | null;
  /** What to do about it, sent with it; null when nothing was said. */
  instruction: string | null;
  /** When it was last sent to the main chat. */
  sentAt: number | null;
  messages: Message[];
};

/** What a /chat stream sends: text as it's written, tools as they're used, then the end. */
export type ChatEvent =
  | { t: "delta"; text: string }
  | { t: "tool"; name: string; detail: string }
  | { t: "done"; text: string; sessionId: string | null }
  | { t: "error"; message: string };
