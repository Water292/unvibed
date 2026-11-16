// Threads a page can give the review instead of a chat: the threads on the
// graph, and what can be done with a selection. We draw the text, the
// selection's buttons, the quote marks and where each thread sits; the page
// draws only the inside of each thread.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useHost, type AskableProps } from "./host.tsx";

/** Where in the graph something is: a node's text, a location's explanation, or lines of code on one side. */
export type Place =
  | { node: string }
  | { node: string; location: string }
  | { code: { path: string; side: "LEFT" | "RIGHT"; start: number; end: number } };

/** Where a quote starts and ends in its text, in characters. */
export type Offsets = { start: number; end: number };

/** A thread, or anything drawn like one, at a place. */
export type ThreadItem = {
  /** Names the item to render and setOpen. */
  id: string;
  /** Where it is: it's drawn under that text, or under the box of code showing its first line. */
  at: Place;
  /** The text it's about, marked where it is. */
  quote: string;
  /** Where the quote was in its text; without them, or if the text there changed, the quote's first match is marked. */
  offsets?: Offsets;
  /** Whether it's drawn; closed ones are only marked. */
  open: boolean;
};

export type Threads = {
  /** Every item on the graph. */
  list: ThreadItem[];
  /** The buttons for a selection: its place, its text, and for text (not code) where it is in it. */
  actions: (selection: { at: Place; quote: string; offsets?: Offsets }) => { label: string; run: () => void }[];
  /** The inside of an item, drawn under its quote while it's open. */
  render: (id: string) => ReactNode;
  /** Opens or closes an item: called when its mark is clicked. */
  setOpen: (id: string, open: boolean) => void;
};

const ThreadsContext = createContext<Threads | undefined>(undefined);
export const ThreadsProvider = ThreadsContext.Provider;

/** A box of code: its file, and whether it shows a line on a side. */
export type CodeBox = { path: string; shows: (side: "LEFT" | "RIGHT", line: number) => boolean };

/** Whether an item is drawn in this text, or in this box of code: there, those on its file whose first line it shows. */
export function isHere(item: ThreadItem, at: Place | undefined, code: CodeBox | undefined): boolean {
  if (code) return "code" in item.at && item.at.code.path === code.path && code.shows(item.at.code.side, item.at.code.start);
  if (!at || "code" in at || "code" in item.at) return false;
  const locationOf = (place: { node: string } | { node: string; location: string }) => ("location" in place ? place.location : undefined);
  return item.at.node === at.node && locationOf(item.at) === locationOf(at);
}

/** Where an item's quote starts in text: at its offsets while the text there is still the quote, else at its first match. */
export function quoteStart(text: string, item: ThreadItem): number | undefined {
  if (!item.quote) return undefined;
  const offsets = item.offsets;
  if (offsets && text.slice(offsets.start, offsets.end) === item.quote) return offsets.start;
  const found = text.indexOf(item.quote);
  return found < 0 ? undefined : found;
}

const ITEM_ATTR = "data-unvibed-item";

/** The text nodes under el, outside drawn items, with where each starts in their joined text. */
function textNodes(el: Element): { node: Text; at: number }[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(`[${ITEM_ATTR}]`) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const found: { node: Text; at: number }[] = [];
  let at = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    found.push({ node: n as Text, at });
    at += (n as Text).data.length;
  }
  return found;
}

/** A Range over an item's quote in el's text; undefined if the quote isn't there. */
function quoteRange(el: Element, item: ThreadItem): Range | undefined {
  const nodes = textNodes(el);
  const start = quoteStart(nodes.map((n) => n.node.data).join(""), item);
  if (start === undefined) return undefined;
  const end = start + item.quote.length;
  const nodeAt = (offset: number) => nodes.filter((n) => n.at <= offset).at(-1)!;
  const first = nodeAt(start);
  const last = nodeAt(end);
  const range = document.createRange();
  range.setStart(first.node, start - first.at);
  range.setEnd(last.node, Math.min(end - last.at, last.node.data.length));
  return range;
}

/** The lines a selection covers in a box of code: head lines if it has any, else base lines. */
function linesOf(box: Element, range: Range): { side: "LEFT" | "RIGHT"; start: number; end: number } | undefined {
  const head: number[] = [];
  const base: number[] = [];
  const numberIn = (row: Element, attr: string) => Number(row.querySelector(`[${attr}]`)?.getAttribute(attr) ?? NaN);
  for (const row of box.querySelectorAll("tr")) {
    if (!range.intersectsNode(row)) continue;
    // a split view's row is one side's; a unified view's row has a line on one side or both
    const splitSide = row.getAttribute("data-side");
    if (splitSide) {
      const line = numberIn(row, "data-line-num");
      if (line > 0) (splitSide === "old" ? base : head).push(line);
      continue;
    }
    const newLine = numberIn(row, "data-line-new-num");
    const oldLine = numberIn(row, "data-line-old-num");
    if (newLine > 0) head.push(newLine);
    else if (oldLine > 0) base.push(oldLine);
  }
  const lines = head.length ? head : base;
  if (!lines.length) return undefined;
  return { side: head.length ? "RIGHT" : "LEFT", start: Math.min(...lines), end: Math.max(...lines) };
}

const BAR_STYLE: CSSProperties = {
  position: "fixed",
  zIndex: 1000,
  display: "flex",
  gap: 2,
  padding: 3,
  borderRadius: 8,
  background: "Canvas",
  color: "CanvasText",
  boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
  border: "1px solid rgba(128,128,128,0.35)",
  fontFamily: "system-ui",
  fontSize: 13,
};
const BUTTON_STYLE: CSSProperties = { border: 0, background: "transparent", color: "inherit", padding: "4px 10px", borderRadius: 6, cursor: "pointer", font: "inherit" };

type SelectableProps = AskableProps & { at?: Place; code?: CodeBox };

/**
 * Text or code that can be asked about. With threads given, it's drawn with them: `at` names the text's place, or
 * `code` the box's file and lines, and the place of a selection in code is its lines. Without, the host's Askable
 * draws it, with anchor and context.
 */
export function Selectable({ at, code, ...askable }: SelectableProps) {
  const threads = useContext(ThreadsContext);
  const { Askable } = useHost();
  if (!threads) return <Askable {...askable} />;
  if (!at && !code) return <div style={askable.style}>{askable.children}</div>;
  return <WithThreads threads={threads} at={at} code={code} style={askable.style}>{askable.children}</WithThreads>;
}

type WithThreadsProps = { threads: Threads; at?: Place; code?: CodeBox; children: ReactNode; style?: CSSProperties };

/** Shows the threads' buttons for a selection here, marks the quotes of the items here, and draws each open one under it. */
function WithThreads({ threads, at, code, children, style }: WithThreadsProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; y: number; buttons: { label: string; run: () => void }[] }>();
  const items = threads.list.filter((item) => isHere(item, at, code));

  // every item's quote, open or not, underlined in this text, and again whenever the text changes: a box of code gets
  // its lines after it's drawn. Browsers without the Highlight API show no marks.
  useEffect(() => {
    const el = textRef.current;
    if (!el || typeof CSS === "undefined" || !("highlights" in CSS)) return;
    // one highlight for the page, shared by every box
    const marks = CSS.highlights.get("unvibed-quote") ?? new Highlight();
    CSS.highlights.set("unvibed-quote", marks);
    let ranges: Range[] = [];
    const markQuotes = () => {
      for (const r of ranges) marks.delete(r);
      ranges = items.map((item) => quoteRange(el, item)).filter((r) => r !== undefined);
      for (const r of ranges) marks.add(r);
    };
    markQuotes();
    const changes = new MutationObserver(markQuotes);
    changes.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      changes.disconnect();
      for (const r of ranges) marks.delete(r);
    };
  });

  // after the mouse is let go, the selection's buttons, if it's two characters or more of this text
  const onMouseUp = () => {
    window.setTimeout(() => {
      const selection = getSelection();
      const el = textRef.current;
      if (!selection || selection.isCollapsed || !selection.rangeCount || !el) return setBar(undefined);
      const range = selection.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return setBar(undefined);
      const quote = selection.toString().trim();
      if (quote.length < 2) return setBar(undefined);
      let place: Place | undefined = at;
      let offsets: Offsets | undefined;
      if (code) {
        const lines = linesOf(el, range);
        place = lines && { code: { path: code.path, ...lines } };
      } else {
        const before = document.createRange();
        before.setStart(el, 0);
        before.setEnd(range.startContainer, range.startOffset);
        const start = before.toString().length;
        offsets = { start, end: start + selection.toString().length };
      }
      if (!place) return setBar(undefined);
      const rect = range.getBoundingClientRect();
      setBar({ x: rect.left, y: rect.top - 38, buttons: threads.actions({ at: place, quote, offsets }) });
    }, 0);
  };

  // a click on a mark, not a drag, opens or closes its item
  const onClick = (e: MouseEvent) => {
    const el = textRef.current;
    if (!el || !getSelection()?.isCollapsed) return;
    const caret = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (!caret) return;
    const hit = items.find((item) => quoteRange(el, item)?.comparePoint(caret.startContainer, caret.startOffset) === 0);
    if (hit) threads.setOpen(hit.id, !hit.open);
  };

  return (
    <div style={style}>
      <div ref={textRef} onMouseUp={onMouseUp} onClick={onClick}>
        {children}
      </div>
      {items
        .filter((item) => item.open)
        .map((item) => (
          <div key={item.id} {...{ [ITEM_ATTR]: item.id }}>
            {threads.render(item.id)}
          </div>
        ))}
      {bar &&
        createPortal(
          // keeps the selection while a button is pressed
          <div style={{ ...BAR_STYLE, left: bar.x, top: Math.max(4, bar.y) }} data-unvibed-bar onMouseDown={(e) => e.preventDefault()}>
            {bar.buttons.map((button) => (
              <button
                key={button.label}
                style={BUTTON_STYLE}
                onClick={() => {
                  setBar(undefined);
                  getSelection()?.removeAllRanges();
                  button.run();
                }}
              >
                {button.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// the marks' look, once per page
if (typeof document !== "undefined" && !document.getElementById("unvibed-quote-style")) {
  const style = document.createElement("style");
  style.id = "unvibed-quote-style";
  style.textContent = "::highlight(unvibed-quote) { text-decoration: underline 2px rgba(37,99,235,0.7); text-underline-offset: 3px; }";
  document.head.appendChild(style);
}
