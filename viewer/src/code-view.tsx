// A node's code, drawn by @git-diff-view/react, unified or split: line
// numbers on both sides, added lines green, deleted lines red. A node's
// locations in the same file on the same side are one group; each location
// has its explanation above its lines. ↑ and ↓ widen a location by 20 lines,
// and once a location's lines reach its neighbour's, the two are drawn as one
// box, the second's explanation sitting at the line it starts on.
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useState } from "react";
import { Askable, Threads } from "./chat.tsx";
import "./code-view.css";
import type { CodeCut } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
import { ReviewState, tint, type RenderedLocation } from "./rendered-location.ts";
import { RiskLine, where as placeOf } from "./risk.tsx";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Lines one click of ↑ or ↓ adds. */
const STEP = 20;
/** Unchanged lines the server keeps around a cut (hunks.ts CONTEXT). */
const CONTEXT = 3;

/** The renderer doesn't follow the system's light or dark setting by itself, so this does. */
export function useDarkMode() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const onChange = () => setDark(m.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** Lines start..end of a file on a side, with above / below more lines, from the server. */
async function fetchCut(path: string, side: Location["side"], start: number, end: number, above: number, below: number): Promise<CodeCut> {
  const q = new URLSearchParams({ path, side, start: String(start), end: String(end), above: String(above), below: String(below) });
  const res = await fetch(`/code?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const startOf = (l: Location) => l.start_line ?? l.line;

/** One of the node's locations as shown, with where it is in the node's list. */
export type Indexed = { rendered: RenderedLocation; location: Location; index: number };

/** A node's locations by file and side, in the order each first appears, each group's sorted by first line. */
export function groupLocations(locations: RenderedLocation[]): Indexed[][] {
  const groups = new Map<string, Indexed[]>();
  locations.forEach((rendered, index) => {
    const location = rendered.location;
    const key = `${location.side}:${location.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ rendered, location, index });
  });
  return [...groups.values()].map((g) => g.sort((a, b) => startOf(a.location) - startOf(b.location) || a.location.line - b.location.line));
}

type Widen = { above: number; below: number };

/**
 * A group's locations run together where their lines would meet: the
 * last line one shows (its end, the server's context lines, and what ↓ added)
 * reaches the line before the first the next shows.
 */
export function blend(group: Indexed[], widen: (i: number) => Widen): Indexed[][] {
  const segments: Indexed[][] = [];
  let shownEnd = -Infinity;
  for (const item of group) {
    const w = widen(item.index);
    const shownStart = startOf(item.location) - CONTEXT - w.above;
    if (segments.length && shownEnd + 1 >= shownStart) segments.at(-1)!.push(item);
    else segments.push([item]);
    shownEnd = Math.max(shownEnd, item.location.line + CONTEXT + w.below);
  }
  return segments;
}

type Props = {
  /** The node the locations are in, which names where a chat about them starts. */
  nodeId: string;
  group: Indexed[];
  viewType: ViewType;
  onReviewed: (index: number, hash: string, reviewed: boolean) => void;
  /** Why the last tick couldn't be saved, by location index. */
  failure: { index: number; message: string } | undefined;
};

/** Several locations' state together: needs review if any does, else reviewed if any is, else unchanged. */
function stateOf(segment: Indexed[]): ReviewState {
  const states = new Set(segment.map((s) => s.rendered.state));
  if (states.has(ReviewState.NeedsReview)) return ReviewState.NeedsReview;
  return states.has(ReviewState.Reviewed) ? ReviewState.Reviewed : ReviewState.Unchanged;
}

/** A file's locations in one node: how far ↑ / ↓ have widened each, and the boxes they make. */
export function LocationGroup({ nodeId, group, viewType, onReviewed, failure }: Props) {
  const [widened, setWidened] = useState<ReadonlyMap<number, Widen>>(new Map());
  const widen = (i: number) => widened.get(i) ?? { above: 0, below: 0 };
  const add = (i: number, side: keyof Widen) => setWidened((m) => new Map(m).set(i, { ...widen(i), [side]: widen(i)[side] + STEP }));
  return (
    <>
      {blend(group, widen).map((segment) => (
        <Segment
          key={segment.map((s) => s.index).join(",")}
          segment={segment}
          above={widen(segment[0]!.index).above}
          below={Math.max(...segment.map((s) => widen(s.index).below))}
          onMore={(side) => add(side === "above" ? segment[0]!.index : segment.at(-1)!.index, side)}
          viewType={viewType}
          onReviewed={onReviewed}
          failure={failure}
          nodeId={nodeId}
        />
      ))}
    </>
  );
}

type SegmentProps = Omit<Props, "group"> & {
  segment: Indexed[];
  above: number;
  below: number;
  onMore: (side: keyof Widen) => void;
};

/** One box: one location's lines, or several that ran together, fetched as one cut. */
function Segment({ nodeId, segment, above, below, onMore, viewType, onReviewed, failure }: SegmentProps) {
  const dark = useDarkMode();
  const first = segment[0]!.location;
  const { path, side } = first;
  const start = startOf(first);
  const end = Math.max(...segment.map((s) => s.location.line));
  const [cut, setCut] = useState<CodeCut>();
  // each location's own lines as they are now, whose hash says whether they changed since the graph was made
  const [own, setOwn] = useState<ReadonlyMap<number, CodeCut>>(new Map());
  const [error, setError] = useState<string>();
  const ids = segment.map((s) => s.index).join(",");
  useEffect(() => {
    let current = true; // a newer request replaces this one's answer
    Promise.all([
      fetchCut(path, side, start, end, above, below),
      ...segment.map((s) => fetchCut(path, side, startOf(s.location), s.location.line, 0, 0)),
    ]).then(
      ([c, ...owns]) => current && (setCut(c), setOwn(new Map(segment.map((s, i) => [s.index, owns[i]!]))), setError(undefined)),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [path, side, start, end, above, below, ids]);
  // Code that changed since the graph was made doesn't have the graph's hash: the graph doesn't explain it, so the box
  // doesn't show it, and it can't be ticked.
  const changedSinceGraph = (s: Indexed) => own.has(s.index) && own.get(s.index)!.hash !== s.location.hash;
  const anyChanged = segment.some(changedSinceGraph);

  const sideName = side === "LEFT" ? "base" : "head";
  const header = (item: Indexed) => (
    <LocationHeader
      item={item}
      fetched={own.has(item.index)}
      changedSinceGraph={changedSinceGraph(item)}
      onReviewed={onReviewed}
      failure={failure?.index === item.index ? failure.message : undefined}
      nodeId={nodeId}
    />
  );
  // every location after the first sits under the line before its own first line
  const fileKey = side === "LEFT" ? "oldFile" : "newFile";
  const extend: Record<string, { data: Indexed }> = {};
  for (const item of segment.slice(1)) extend[String(Math.max(1, startOf(item.location) - 1))] = { data: item };
  const where = segment.map((s) => `${path}:${startOf(s.location)}-${s.location.line}`).join(", ");
  return (
    <>
    <div
      data-testid="segment"
      style={{ marginTop: 16, padding: 6, borderRadius: 8, background: tint(stateOf(segment)) }}
    >
      {header(segment[0]!)}
      {error && <div style={{ fontSize: 12, opacity: 0.7 }}>{error}</div>}
      {cut && !anyChanged && (
        <Askable anchor={`loc:${nodeId}#${segment[0]!.index}`} context={`Code in ${where} (${sideName} side), in graph node ${nodeId}`} style={{ all: "unset", display: "block" }}>
        <div className="code-view">
          {cut.diff === "" ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {sideName} side</div>
          ) : (
            <>
              {cut.moreAbove && <More arrow="↑" onClick={() => onMore("above")} />}
              <DiffView<Indexed>
                data={{ oldFile: { fileName: path }, newFile: { fileName: path }, hunks: [cut.diff] }}
                extendData={{ [fileKey]: extend }}
                // split view asks for both sides' rows; only the location's own side has one
                renderExtendLine={({ data }) => (data ? <div className="code-view-inline">{header(data)}</div> : null)}
                diffViewMode={viewType === ViewType.Split ? DiffModeEnum.Split : DiffModeEnum.Unified}
                diffViewWrap={false}
                diffViewHighlight={false}
                diffViewTheme={dark ? "dark" : "light"}
                diffViewFontSize={12}
              />
              {cut.moreBelow && <More arrow="↓" onClick={() => onMore("below")} />}
            </>
          )}
        </div>
        </Askable>
      )}
    </div>
    {segment.map((s) => (
      <Threads key={s.index} anchor={`loc:${nodeId}#${s.index}`} />
    ))}
    </>
  );
}

type HeaderProps = {
  nodeId: string;
  item: Indexed;
  /** Whether the location's own lines have arrived, and whether they've changed since the graph was made. */
  fetched: boolean;
  changedSinceGraph: boolean;
  onReviewed: (index: number, hash: string, reviewed: boolean) => void;
  failure: string | undefined;
};

/** A location's place, its reviewed box, what its lines do, and the AI reviewer's risk for them. */
function LocationHeader({ nodeId, item: { rendered, location: l, index }, fetched, changedSinceGraph, onReviewed, failure }: HeaderProps) {
  const start = startOf(l);
  return (
    <div data-testid="location" style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7 }}>
          {l.path}:{start}
          {start !== l.line ? `-${l.line}` : ""} ({l.side === "LEFT" ? "base" : "head"})
        </span>
        {fetched && !changedSinceGraph && (
          <label style={{ fontSize: 11, fontFamily: "system-ui" }}>
            <input type="checkbox" checked={rendered.ticked} onChange={(e) => onReviewed(index, l.hash, e.target.checked)} /> reviewed
          </label>
        )}
      </div>
      {changedSinceGraph && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 4 }}>This code changed since the graph was made, so it isn't shown: update the graph.</div>
      )}
      {failure && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 4 }}>Couldn't save: {failure}</div>}
      {l.text && (
        <Askable anchor={`loc:${nodeId}#${index}`} context={`The explanation of ${l.path}:${start}-${l.line} (${l.side === "LEFT" ? "base" : "head"} side), in graph node ${nodeId}: ${l.text}`}>
          <div className="location-text">{l.text}</div>
        </Askable>
      )}
      <RiskLine
        risk={l.risk}
        detailed
        ask={{
          anchor: `loc:${nodeId}#${index}`,
          context: `The AI reviewer's risk for ${placeOf(l)} (${l.side === "LEFT" ? "base" : "head"} side), in graph node ${nodeId}: ${l.risk?.level} — ${l.risk?.reason ?? ""}`,
        }}
      />
    </div>
  );
}

/** A full-width row that shows STEP more lines on its side. */
function More({ arrow, onClick }: { arrow: string; onClick: () => void }) {
  return (
    <button className="code-view-more" onClick={onClick} title={`Show ${STEP} more lines`}>
      {arrow}
    </button>
  );
}
