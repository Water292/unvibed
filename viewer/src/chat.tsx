// Chat threads in the page. Select text in anything marked with data-anchor
// (a node's explanation, a location's explanation, code or risk, an answer)
// and an Ask button appears; asking starts a thread under that text, answered
// by Claude Code through the server, word by word. Text selected in an answer
// starts a thread nested under that answer. Each thread can be summarized;
// the summary is kept with it.
//
// A thread is kept the moment it starts. The text it quotes stays underlined;
// clicking the underline opens or closes the thread. ✕ closes it, 🗑 deletes it.
//
// A thread can be staged to send to the main Claude Code chat: Stage stages it
// as is, right-click adds what to do (fix this, evaluate…). The staged threads
// sit in a bar along the bottom, each one a row that goes to where it was
// asked, shows its chat (read only) or unstages it; Send all copies them as
// one block, each with where it is and what was said, to paste into the chat.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { ChatEvent, Thread } from "../../shared/chat.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** A thread's answer while it's being written: the text so far and the tools used. */
type Live = { text: string; tools: string[] };

/** What staging can say to do about a thread; anything else is typed. */
const INSTRUCTIONS = ["Fix this", "Evaluate", "Explain more"];

/** Where a thread's quote is on the page, once placed. */
type Placed = { id: string; range: Range };

type Chat = {
  threads: Thread[];
  /** Stages a thread with what to do (null: nothing said), or unstages it (staged false). */
  stage: (threadId: string, staged: boolean, instruction?: string | null) => void;
  /** Opens the stage menu for a thread at the pointer. */
  menu: (threadId: string, e: ReactMouseEvent) => void;
  /** Goes to where a thread was asked: its node, the thread open, its quote in view and flashed. */
  goTo: (threadId: string) => void;
  /** Marks threads sent: unstaged, with when. */
  markSent: (ids: string[]) => void;
  /** Where an anchor is, in a few words: the node, and a location's file and lines. */
  describe: (anchor: string) => string;
  placed: { current: Placed[] };
  /** The Askable each placed thread's quote is in, by thread id, where the thread opens. */
  homes: ReadonlyMap<string, HTMLElement>;
  setHomes: (homes: ReadonlyMap<string, HTMLElement>) => void;
  open: ReadonlySet<string>;
  live: ReadonlyMap<string, Live>;
  summarizing: ReadonlySet<string>;
  /** Starts a thread at a quote, open for the first question. */
  start: (anchor: string, quote: string, quoteOffset: number, context: string, parentId: string | null) => void;
  send: (threadId: string, message: string) => void;
  summarize: (threadId: string) => void;
  toggle: (threadId: string, open?: boolean) => void;
  remove: (threadId: string) => void;
};

const ChatContext = createContext<Chat | undefined>(undefined);
export const useChat = () => useContext(ChatContext)!;

/** The node a thread was asked in: its own anchor's, or for a thread asked about an answer, that thread's. */
export function nodeOfThread(t: Thread, threads: Thread[]): string | undefined {
  const [kind, rest = ""] = t.anchor.split(/:(.*)/s);
  if (kind === "node") return rest;
  if (kind === "loc") return rest.split("#")[0];
  const parent = threads.find((x) => x.id === t.parentId);
  return parent && nodeOfThread(parent, threads);
}

/**
 * The threads, loaded once and kept here, with which are open and what's being answered now, and the staged bar
 * below the page. selectNode opens a node's panel, for going to a thread.
 */
export function ChatProvider({ children, selectNode, describe }: { children: ReactNode; selectNode: (id: string) => void; describe: (anchor: string) => string }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [live, setLive] = useState<ReadonlyMap<string, Live>>(new Map());
  const [summarizing, setSummarizing] = useState<ReadonlySet<string>>(new Set());
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; threadId: string }>();
  const placed = useRef<Placed[]>([]);
  const [homes, setHomes] = useState<ReadonlyMap<string, HTMLElement>>(new Map());
  useEffect(() => {
    fetch("/threads").then((r) => (r.ok ? r.json() : [])).then(setThreads, () => {});
  }, []);
  const update = (id: string, f: (t: Thread) => Thread) => setThreads((ts) => ts.map((t) => (t.id === id ? f(t) : t)));
  const setLiveFor = (id: string, l: Live | undefined) =>
    setLive((m) => {
      const n = new Map(m);
      if (l) n.set(id, l);
      else n.delete(id);
      return n;
    });
  const toggle = (id: string, to?: boolean) =>
    setOpen((s) => {
      const n = new Set(s);
      if (to ?? !n.has(id)) n.add(id);
      else n.delete(id);
      return n;
    });

  const chat: Chat = {
    threads,
    open,
    live,
    summarizing,
    toggle,
    placed,
    homes,
    setHomes,
    describe,
    markSent: (ids) => {
      const now = Date.now();
      setThreads((ts) => ts.map((t) => (ids.includes(t.id) ? { ...t, stagedAt: null, instruction: null, sentAt: now } : t)));
    },
    stage: (threadId, staged, instruction = null) => {
      update(threadId, (x) => ({ ...x, stagedAt: staged ? (x.stagedAt ?? Date.now()) : null, instruction: staged ? instruction : null }));
      fetch("/stage", { method: "POST", body: JSON.stringify({ threadId, staged, instruction }) }).catch(() => {});
    },
    menu: (threadId, e) => {
      e.preventDefault();
      setMenuAt({ x: e.clientX, y: e.clientY, threadId });
    },
    goTo: (threadId) => {
      const t = threads.find((x) => x.id === threadId);
      const node = t && nodeOfThread(t, threads);
      if (!t || !node) return;
      // the thread and every thread it was asked from are open, so it's on the page
      for (let x: Thread | undefined = t; x; x = threads.find((y) => y.id === x!.parentId)) toggle(x.id, true);
      selectNode(node);
      // the panel and its code load after this; wait for the quote to be placed, then bring it into view
      const started = Date.now();
      const look = () => {
        const p = placed.current.find((q) => q.id === threadId);
        if (!p) return Date.now() - started < 5000 && setTimeout(look, 150);
        p.range.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
        if ("highlights" in CSS) {
          CSS.highlights.set("thread-quote-flash", new Highlight(p.range));
          setTimeout(() => CSS.highlights.delete("thread-quote-flash"), 1600);
        }
      };
      setTimeout(look, 100);
    },
    start: (anchor, quote, quoteOffset, context, parentId) => {
      const t: Thread = { id: crypto.randomUUID(), parentId, anchor, quote, quoteOffset, context, sessionId: null, summary: null, stagedAt: null, instruction: null, sentAt: null, messages: [] };
      setThreads((ts) => [...ts, t]);
      toggle(t.id, true);
      fetch("/start-thread", {
        method: "POST",
        body: JSON.stringify({ threadId: t.id, parentId: parentId ?? undefined, anchor, quote, quoteOffset, context }),
      }).catch(() => {});
    },
    send: async (threadId, message) => {
      const t = threads.find((x) => x.id === threadId);
      if (!t || live.has(threadId)) return;
      update(threadId, (x) => ({ ...x, messages: [...x.messages, { role: "user", text: message }] }));
      let current: Live = { text: "", tools: [] };
      setLiveFor(threadId, current);
      const finish = (text: string) => {
        setLiveFor(threadId, undefined);
        update(threadId, (x) => ({ ...x, messages: [...x.messages, { role: "assistant", text }] }));
      };
      try {
        const res = await fetch("/chat", {
          method: "POST",
          body: JSON.stringify({ threadId, parentId: t.parentId ?? undefined, anchor: t.anchor, quote: t.quote, quoteOffset: t.quoteOffset, context: t.context, message }),
        });
        if (!res.ok || !res.body) return finish(`⚠ ${await res.text()}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const e = JSON.parse(buffer.slice(0, nl)) as ChatEvent;
            buffer = buffer.slice(nl + 1);
            if (e.t === "delta") current = { ...current, text: current.text + e.text };
            else if (e.t === "tool") current = { ...current, tools: [...current.tools, `${e.name} ${e.detail}`.trim()] };
            else if (e.t === "done") {
              update(threadId, (x) => ({ ...x, sessionId: e.sessionId }));
              return finish(e.text);
            } else if (e.t === "error") return finish(`⚠ ${e.message}`);
            setLiveFor(threadId, current);
          }
        }
        finish(current.text || "⚠ the answer stopped before it finished");
      } catch (e) {
        finish(`⚠ ${(e as Error).message}`);
      }
    },
    summarize: async (threadId) => {
      setSummarizing((s) => new Set(s).add(threadId));
      const res = await fetch("/summarize", { method: "POST", body: JSON.stringify({ threadId }) });
      const text = await res.text();
      setSummarizing((s) => {
        const n = new Set(s);
        n.delete(threadId);
        return n;
      });
      update(threadId, (x) => ({ ...x, summary: res.ok ? text : `⚠ ${text}` }));
    },
    remove: async (threadId) => {
      const gone = new Set([threadId]);
      // a thread's nested threads go with it
      for (let grew = true; grew; ) {
        grew = false;
        for (const t of threads) if (t.parentId && gone.has(t.parentId) && !gone.has(t.id)) (gone.add(t.id), (grew = true));
      }
      setThreads((ts) => ts.filter((t) => !gone.has(t.id)));
      await fetch("/delete-thread", { method: "POST", body: JSON.stringify({ threadId }) });
    },
  };
  return (
    <ChatContext.Provider value={chat}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: "1 1 0", minHeight: 0, position: "relative" }}>{children}</div>
        <StagedBar />
      </div>
      <AskButton />
      <Underlines />
      {menuAt && <StageMenu at={menuAt} onClose={() => setMenuAt(undefined)} />}
    </ChatContext.Provider>
  );
}

/** Stage as is, with something to do, or unstage: at the pointer, closed by a pick or a click elsewhere. */
function StageMenu({ at, onClose }: { at: { x: number; y: number; threadId: string }; onClose: () => void }) {
  const { threads, stage } = useChat();
  const t = threads.find((x) => x.id === at.threadId);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("mousedown", away), document.removeEventListener("keydown", esc));
  }, []);
  if (!t) return null;
  const pick = (instruction: string | null) => (stage(t.id, true, instruction), onClose());
  const item = (label: ReactNode, onClick: () => void, current = false) => (
    <button key={String(label)} onClick={onClick} className="stage-menu-item" style={{ fontWeight: current ? 700 : 400 }}>
      {label}
    </button>
  );
  return (
    <div
      ref={box}
      role="menu"
      data-testid="stage-menu"
      style={{
        position: "fixed",
        left: Math.min(at.x, window.innerWidth - 200),
        top: Math.min(at.y, window.innerHeight - 220),
        zIndex: 1001,
        minWidth: 180,
        padding: 4,
        borderRadius: 8,
        border: "1px solid rgba(128,128,128,0.35)",
        background: "Canvas",
        color: "CanvasText",
        colorScheme: "light dark",
        boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
        fontFamily: "system-ui",
        fontSize: 12.5,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`.stage-menu-item { all: unset; padding: 5px 10px; border-radius: 5px; cursor: pointer; } .stage-menu-item:hover { background: rgba(37,99,235,0.12); }`}</style>
      {item("Stage, nothing to say", () => pick(null), t.stagedAt !== null && t.instruction === null)}
      {INSTRUCTIONS.map((i) => item(i, () => pick(i), t.instruction === i))}
      {item(t.instruction && !INSTRUCTIONS.includes(t.instruction) ? `“${t.instruction}”…` : "Something else…", () => {
        const typed = prompt("What should be done about this thread?", t.instruction ?? "");
        if (typed?.trim()) pick(typed.trim());
        else onClose();
      }, !!t.instruction && !INSTRUCTIONS.includes(t.instruction))}
      {t.stagedAt !== null && <div style={{ height: 1, background: "rgba(128,128,128,0.3)", margin: "4px 0" }} />}
      {t.stagedAt !== null && item("Unstage", () => (stage(t.id, false), onClose()))}
    </div>
  );
}

/** The location a thread's anchor names, as "path:lines", or the node; for the staged bar. */
function placeLabel(t: Thread, threads: Thread[], describe: (anchor: string) => string): string {
  const [kind] = t.anchor.split(":");
  if (kind === "thread") {
    const parent = threads.find((x) => x.id === t.parentId);
    return parent ? `↳ ${placeLabel(parent, threads, describe)}` : "a thread";
  }
  return describe(t.anchor);
}

/** The staged threads along the bottom, a row each, and Send all; nothing when none are staged. */
function StagedBar() {
  const { threads, stage, menu, goTo, markSent, describe } = useChat();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string>();
  const [manual, setManual] = useState<string>();
  const staged = threads.filter((t) => t.stagedAt !== null).sort((a, b) => a.stagedAt! - b.stagedAt!);
  if (!staged.length && !note && !manual) return null;
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sendAll = async () => {
    const res = await fetch("/staged-text");
    const { ids, text } = (await res.json()) as { ids: string[]; text: string };
    if (!ids.length) return;
    try {
      await navigator.clipboard.writeText(text);
      setNote(`Copied ${ids.length} thread${ids.length === 1 ? "" : "s"}: paste into the Claude Code chat (⌘V) and send.`);
      setTimeout(() => setNote(undefined), 6000);
    } catch {
      setManual(text); // the browser wouldn't copy: show it to copy by hand
    }
    markSent(ids);
    await fetch("/mark-sent", { method: "POST", body: JSON.stringify({ ids }) });
  };
  const button = (label: string, title: string, onClick: () => void, extra: CSSProperties = {}) => (
    <button title={title} aria-label={title} onClick={onClick} style={{ fontSize: 12, padding: "1px 6px", cursor: "pointer", ...extra }}>
      {label}
    </button>
  );
  return (
    <div
      data-testid="staged-bar"
      style={{
        flexShrink: 0,
        maxHeight: "40vh",
        overflow: "auto",
        borderTop: "2px solid #2563eb",
        background: "Canvas",
        color: "CanvasText",
        colorScheme: "light dark",
        fontFamily: "system-ui",
        fontSize: 12.5,
        padding: "6px 12px",
        zIndex: 2,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: staged.length ? 4 : 0 }}>
        <b>Staged ({staged.length})</b>
        {note && <span data-testid="staged-note" style={{ color: "#16a34a" }}>{note}</span>}
        <span style={{ flex: 1 }} />
        {staged.length > 0 && button("Send all", "Copy every staged thread to paste into the Claude Code chat", sendAll, { fontWeight: 600, padding: "2px 12px" })}
      </div>
      {manual && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ marginBottom: 2 }}>The browser wouldn't copy; select this and copy it:</div>
          <textarea readOnly value={manual} rows={6} style={{ width: "100%", fontFamily: MONO, fontSize: 11 }} onFocus={(e) => e.target.select()} />
          {button("Done", "Close", () => setManual(undefined))}
        </div>
      )}
      {staged.map((t) => (
        <div key={t.id} data-testid="staged-row" style={{ borderTop: "1px solid rgba(128,128,128,0.2)", padding: "3px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button
              title="What to do about it (click or right-click to change)"
              onClick={(e) => menu(t.id, e)}
              onContextMenu={(e) => menu(t.id, e)}
              style={{ fontSize: 12, padding: "1px 6px", cursor: "pointer", flexShrink: 0, fontWeight: t.instruction ? 600 : 400, opacity: t.instruction ? 1 : 0.6 }}
            >
              {t.instruction ?? "—"} ▾
            </button>
            <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7, flexShrink: 0 }}>{placeLabel(t, threads, describe)}</span>
            <span style={{ fontStyle: "italic", opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }} title={t.quote}>
              “{t.quote}”
            </span>
            {button("↗", "Go to where this was asked", () => goTo(t.id))}
            {button("💬", expanded.has(t.id) ? "Hide the chat" : "Show the chat", () => toggle(t.id), expanded.has(t.id) ? { background: "rgba(37,99,235,0.15)" } : {})}
            {button("×", "Unstage", () => stage(t.id, false))}
          </div>
          {expanded.has(t.id) && (
            <div data-testid="staged-chat" style={{ margin: "4px 0 4px 12px", padding: "4px 8px", borderLeft: "3px solid rgba(37,99,235,0.5)", maxHeight: 220, overflow: "auto" }}>
              {t.summary ? (
                <div>
                  <b style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>Summary</b>
                  <div style={{ whiteSpace: "pre-wrap" }}>{t.summary}</div>
                </div>
              ) : t.messages.length ? (
                t.messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} style={{ fontWeight: 600, marginTop: i ? 6 : 0 }}>
                      {m.text}
                    </div>
                  ) : (
                    <Answer key={i} text={m.text} />
                  ),
                )
              ) : (
                <div style={{ opacity: 0.6 }}>Nothing asked yet.</div>
              )}
              <div style={{ marginTop: 4, opacity: 0.6, fontSize: 11 }}>To keep chatting, go to it (↗).</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * An element's text with each run of whitespace as one space, and for each of
 * its characters the text node and offset it came from. Selections and the
 * DOM disagree on whitespace (table cells, line breaks), so quotes are found
 * and placed in this form.
 */
function flatten(el: Element): { text: string; at: [Text, number][] } {
  let text = "";
  const at: [Text, number][] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let block: Element | null | undefined;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    // text in another cell, row or block is apart from the text before it, as a selection of both reads
    const b = n.parentElement?.closest("td, th, tr, div, p, li, pre");
    if (block !== undefined && b !== block && text !== "" && !text.endsWith(" ")) {
      text += " ";
      at.push([n, 0]);
    }
    block = b;
    const s = n.data;
    for (let i = 0; i < s.length; i++) {
      const space = /\s/.test(s[i]!);
      if (space && (text === "" || text.endsWith(" "))) continue;
      text += space ? " " : s[i];
      at.push([n, i]);
    }
  }
  return { text, at };
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Text that can be asked about: anchor names where it is, context says what it is (told to Claude), parentId is set for an answer in a thread. */
export function Askable({ anchor, context, parentId, children, style }: { anchor: string; context: string; parentId?: string; children: ReactNode; style?: CSSProperties }) {
  const { threads, open, homes } = useChat();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  // the open threads whose quote is in this text open right under it
  const here = el ? threads.filter((t) => open.has(t.id) && homes.get(t.id) === el) : [];
  return (
    <>
      <div ref={setEl} data-anchor={anchor} data-context={context} data-parent={parentId} style={style}>
        {children}
      </div>
      {here.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0" }}>
          {here.map((t) => (
            <ThreadView key={t.id} thread={t} />
          ))}
        </div>
      )}
    </>
  );
}

/** Floats by a selection inside an Askable; a click starts a thread there. */
function AskButton() {
  const { start } = useChat();
  const [at, setAt] = useState<{ x: number; y: number; anchor: string; context: string; parentId: string | null; quote: string; offset: number }>();
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.("[data-ask-button]")) return;
      // after the click has updated the selection
      setTimeout(() => {
        const sel = getSelection();
        const quote = squash(sel?.toString() ?? "");
        if (!sel || !quote || sel.rangeCount === 0) return setAt(undefined);
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const el = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-anchor]");
        if (!el) return setAt(undefined);
        // where the selection starts in the element's flattened text
        const flat = flatten(el);
        let offset = flat.at.findIndex(([n, i]) => n === node && i >= range.startOffset);
        if (offset < 0) offset = flat.text.indexOf(quote);
        const rect = range.getBoundingClientRect();
        setAt({
          x: Math.min(rect.right, window.innerWidth - 80),
          y: rect.bottom + 6,
          anchor: el.dataset.anchor!,
          context: el.dataset.context ?? "",
          parentId: el.dataset.parent ?? null,
          quote: quote.slice(0, 2000),
          offset: Math.max(0, offset),
        });
      });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);
  if (!at) return null;
  return (
    <button
      data-ask-button
      onClick={() => {
        start(at.anchor, at.quote, at.offset, at.context, at.parentId);
        getSelection()?.removeAllRanges();
        setAt(undefined);
      }}
      style={{
        position: "fixed",
        left: at.x - 40,
        top: at.y,
        zIndex: 1000,
        fontSize: 12,
        padding: "3px 10px",
        borderRadius: 6,
        border: "1px solid #2563eb",
        background: "#2563eb",
        color: "white",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      💬 Ask
    </button>
  );
}

/**
 * Underlines each thread's quote where it was selected, with the browser's
 * CSS highlights, which leave the page's DOM alone, and opens or closes a
 * thread when its underline is clicked. Re-placed whenever the page's text
 * changes: an answer streaming in, code widening, a panel opening.
 */
function Underlines() {
  const { threads, open, toggle, placed, homes, setHomes } = useChat();
  const staged = new Set(threads.filter((t) => t.stagedAt !== null).map((t) => t.id));
  useEffect(() => {
    if (!("highlights" in CSS)) return;
    let timer: number | undefined;
    const place = () => {
      const all: { id: string; range: Range }[] = [];
      const found = new Map<string, HTMLElement>();
      for (const t of threads) {
        const quote = squash(t.quote);
        if (!quote) continue;
        for (const el of document.querySelectorAll<HTMLElement>(`[data-anchor="${CSS.escape(t.anchor)}"]`)) {
          const flat = flatten(el);
          // the occurrence nearest where it was selected
          let best = -1;
          for (let i = flat.text.indexOf(quote); i >= 0; i = flat.text.indexOf(quote, i + 1))
            if (best < 0 || Math.abs(i - t.quoteOffset) < Math.abs(best - t.quoteOffset)) best = i;
          if (best < 0) continue;
          const [startNode, startOffset] = flat.at[best]!;
          const [endNode, endOffset] = flat.at[best + quote.length - 1]!;
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset + 1);
          all.push({ id: t.id, range });
          found.set(t.id, el);
          break;
        }
      }
      placed.current = all;
      if (found.size !== homes.size || [...found].some(([id, el]) => homes.get(id) !== el)) setHomes(found);
      CSS.highlights.set("thread-quote", new Highlight(...all.filter((p) => !open.has(p.id) && !staged.has(p.id)).map((p) => p.range)));
      CSS.highlights.set("thread-quote-open", new Highlight(...all.filter((p) => open.has(p.id) && !staged.has(p.id)).map((p) => p.range)));
      CSS.highlights.set("thread-quote-staged", new Highlight(...all.filter((p) => staged.has(p.id)).map((p) => p.range)));
    };
    place();
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = window.setTimeout(place, 100);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    return () => (observer.disconnect(), clearTimeout(timer));
  }, [threads, open, [...staged].join(), homes]);

  // the thread whose underline is under the pointer, if any
  const hit = (e: MouseEvent) => {
    const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY);
    const range = pos ? undefined : document.caretRangeFromPoint?.(e.clientX, e.clientY);
    const caret = pos ?? (range && { offsetNode: range.startContainer, offset: range.startOffset });
    if (!caret) return undefined;
    return placed.current.find(({ range }) => {
      try {
        return range.isPointInRange(caret.offsetNode, caret.offset);
      } catch {
        return false;
      }
    });
  };
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (getSelection()?.toString()) return; // finishing a selection, not a click
      const p = hit(e);
      if (!p) return;
      toggle(p.id);
      // show it, if it's opening
      setTimeout(() => document.querySelector(`[data-thread="${p.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    };
    const onMove = (e: MouseEvent) => {
      const over = !!hit(e);
      if (over !== document.body.classList.contains("over-thread-quote")) document.body.classList.toggle("over-thread-quote", over);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("mousemove", onMove);
    return () => (document.removeEventListener("click", onClick), document.removeEventListener("mousemove", onMove));
  });
  return (
    <style>{`
      ::highlight(thread-quote) { text-decoration: underline dotted #2563eb 2px; text-underline-offset: 3px; background-color: rgba(37, 99, 235, 0.07); }
      ::highlight(thread-quote-open) { text-decoration: underline solid #2563eb 2px; text-underline-offset: 3px; background-color: rgba(37, 99, 235, 0.16); }
      ::highlight(thread-quote-staged) { text-decoration: underline solid #d97706 2px; text-underline-offset: 3px; background-color: rgba(217, 119, 6, 0.14); }
      ::highlight(thread-quote-flash) { background-color: rgba(250, 204, 21, 0.75); }
      body.over-thread-quote, body.over-thread-quote * { cursor: pointer !important; }
    `}</style>
  );
}

/** The open threads started at an anchor whose quote isn't on the page, each with the threads nested under its answers. */
export function Threads({ anchor }: { anchor: string }) {
  const { threads, open, homes } = useChat();
  // a thread whose quote is on the page opens under it (Askable); here are the rest, such as one whose text changed
  const here = threads.filter((t) => t.anchor === anchor && open.has(t.id) && !homes.has(t.id));
  if (!here.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {here.map((t) => (
        <ThreadView key={t.id} thread={t} />
      ))}
    </div>
  );
}

function ThreadView({ thread: t }: { thread: Thread }) {
  const { live, summarizing, send, summarize, remove, toggle, stage, menu } = useChat();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const now = live.get(t.id);
  useEffect(() => {
    if (!t.messages.length) input.current?.focus();
  }, []);
  const submit = () => {
    if (!draft.trim() || now) return;
    send(t.id, draft.trim());
    setDraft("");
  };
  const replies = t.messages.filter((m) => m.role === "assistant").length;
  return (
    <div
      data-testid="thread"
      data-thread={t.id}
      style={{
        border: "1px solid rgba(37, 99, 235, 0.35)",
        borderLeft: "3px solid #2563eb",
        borderRadius: 6,
        padding: "6px 10px",
        background: "Canvas",
        color: "CanvasText",
        fontFamily: "system-ui",
        fontSize: 12.5,
        lineHeight: 1.45,
        whiteSpace: "normal",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontStyle: "italic", opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={t.quote}>
          “{t.quote}”
        </span>
        <span style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "baseline" }}>
          {t.stagedAt !== null ? (
            <span data-testid="staged-badge" style={{ fontSize: 10.5, fontWeight: 700, color: "#d97706", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Staged{t.instruction ? ` · ${t.instruction}` : ""}
            </span>
          ) : t.sentAt ? (
            <span style={{ fontSize: 10.5, opacity: 0.6 }}>sent {new Date(t.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          ) : null}
          <span style={{ opacity: 0.6 }}>{replies ? `${replies} ${replies === 1 ? "reply" : "replies"}` : "new"}</span>
          <button
            onClick={() => stage(t.id, t.stagedAt === null)}
            onContextMenu={(e) => menu(t.id, e)}
            title={t.stagedAt === null ? "Stage to send to the main chat (right-click: say what to do)" : "Unstage (right-click: change what to do)"}
            style={{ fontSize: 11, ...(t.stagedAt !== null ? { background: "rgba(217,119,6,0.18)", borderColor: "#d97706" } : {}) }}
          >
            {t.stagedAt === null ? "Stage" : "Staged ✓"}
          </button>
          <button
            onClick={() => summarize(t.id)}
            disabled={!t.sessionId || summarizing.has(t.id) || !!now}
            title="Ask Claude to summarize this thread; the summary is kept with it"
            style={{ fontSize: 11 }}
          >
            {summarizing.has(t.id) ? "Summarizing…" : "Summarize"}
          </button>
          <button
            onClick={() => confirm("Delete this thread, and any threads started from it?") && remove(t.id)}
            title="Delete this thread and the threads under it"
            aria-label="Delete thread"
            style={{ fontSize: 11 }}
          >
            🗑
          </button>
          <button onClick={() => toggle(t.id, false)} title="Close; click the underlined text to open it again" aria-label="Close thread" style={{ fontSize: 11 }}>
            ✕
          </button>
        </span>
      </div>
      {t.summary && (
        <div data-testid="summary" style={{ marginTop: 6, padding: "4px 8px", borderRadius: 4, background: "rgba(37, 99, 235, 0.08)" }}>
          <b style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.7 }}>Summary</b>
          <div style={{ whiteSpace: "pre-wrap" }}>{t.summary}</div>
        </div>
      )}
      {t.messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} style={{ marginTop: 8, fontWeight: 600 }}>
            {m.text}
          </div>
        ) : (
          <div key={i}>
            <Askable anchor={`thread:${t.id}#${i}`} context={`An answer in a thread about «${t.quote}» (${t.context})`} parentId={t.id} style={{ marginTop: 4 }}>
              <Answer text={m.text} />
            </Askable>
            <Threads anchor={`thread:${t.id}#${i}`} />
          </div>
        ),
      )}
      {now && (
        <div style={{ marginTop: 4 }}>
          {now.tools.map((tool, i) => (
            <div key={i} style={{ fontFamily: MONO, fontSize: 11, opacity: 0.55 }}>
              ⚙ {tool}
            </div>
          ))}
          <Answer text={now.text || "Thinking…"} />
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <textarea
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), submit())}
          placeholder={t.messages.length ? "Ask a follow-up…" : "Ask about this…"}
          rows={2}
          style={{ flex: 1, font: "inherit", resize: "vertical", padding: 4, background: "Canvas", color: "CanvasText" }}
        />
        <button onClick={submit} disabled={!draft.trim() || !!now} style={{ alignSelf: "flex-end" }}>
          {now ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/** An answer's text: paragraphs, `code` and fenced code drawn as code, the rest as written. */
function Answer({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?(?:```|$))/);
  return (
    <div data-testid="answer">
      {blocks.map((b, i) =>
        b.startsWith("```") ? (
          <pre key={i} style={{ fontFamily: MONO, fontSize: 11.5, background: "rgba(128,128,128,0.12)", padding: 6, borderRadius: 4, overflowX: "auto", whiteSpace: "pre" }}>
            {b.replace(/^```\w*\n?/, "").replace(/```$/, "")}
          </pre>
        ) : (
          <div key={i} style={{ whiteSpace: "pre-wrap" }}>
            {b.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/).map((s, j) =>
              s.startsWith("`") && s.endsWith("`") && s.length > 1 ? (
                <code key={j} style={{ fontFamily: MONO, fontSize: 11.5, background: "rgba(128,128,128,0.15)", padding: "0 3px", borderRadius: 3 }}>
                  {s.slice(1, -1)}
                </code>
              ) : s.startsWith("**") && s.endsWith("**") && s.length > 4 ? (
                <b key={j}>{s.slice(2, -2)}</b>
              ) : (
                s
              ),
            )}
          </div>
        ),
      )}
    </div>
  );
}
