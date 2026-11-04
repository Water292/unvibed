// A node's code, drawn by @git-diff-view/react, unified or split: line
// numbers on both sides, added lines green, deleted lines red. Each location
// has its place, its reviewed box and its explanation above its lines. A
// box fetches its code as a small unified diff, holding only its locations'
// own lines until ↑ or ↓ asks for more; once a location's lines reach the
// next one's in the same file and side, the two are one box (blend.ts), the
// second's header sitting at the line it starts on.
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useMemo, useState } from "react";
import "./code-view.css";
import type { CodeCut } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
import { blend, startOf, type Indexed, type Segment, type Widen } from "./blend.ts";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Lines one click of ↑ or ↓ adds. */
const STEP = 20;

/** The renderer doesn't follow the system's light or dark setting by itself, so this does. */
function useDarkMode() {
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

const sideName = (side: Location["side"]) => (side === "LEFT" ? "base" : "head");

/**
 * group: a node's locations in one file on one side (groupLocations). marks: the marks made since the page loaded, by
 * hash; a location's box is ticked by its code's hash there, else by what its code came with. onReviewed: called
 * with the location's index and that hash when its box is ticked or cleared. failure: why the last tick couldn't be
 * saved, and for which location, if it couldn't.
 */
type Props = {
  group: Indexed[];
  viewType: ViewType;
  marks: ReadonlyMap<string, boolean>;
  onReviewed: (index: number, hash: string, reviewed: boolean) => void;
  failure: { index: number; message: string } | undefined;
};

/** A file's locations in one node: how many lines ↑ and ↓ have added to each, and the boxes they make. */
export function LocationGroup({ group, ...rest }: Props) {
  const [widened, setWidened] = useState<ReadonlyMap<number, Widen>>(new Map());
  const widen = (i: number) => widened.get(i) ?? { above: 0, below: 0 };
  const set = (i: number, w: Widen) => setWidened((m) => new Map(m).set(i, w));
  return blend(group, widen).map((segment) => {
    const first = segment.items[0]!;
    const last = segment.items.at(-1)!;
    return (
      <SegmentView
        // a box keeps its first location as it takes in the next ones, so it keeps its code on screen until the wider cut arrives
        key={first.index}
        segment={segment}
        // ↑ widens the first location, ↓ the last, each from as far as the box already reaches
        onUp={() => set(first.index, { ...widen(first.index), above: segment.above + STEP })}
        onDown={() => set(last.index, { ...widen(last.index), below: segment.end + segment.below + STEP - last.location.line })}
        {...rest}
      />
    );
  });
}

type SegmentProps = Omit<Props, "group"> & { segment: Segment; onUp: () => void; onDown: () => void };

/** One box: one location's lines, or several that ran together, fetched as one cut. */
function SegmentView({ segment, onUp, onDown, viewType, marks, onReviewed, failure }: SegmentProps) {
  const dark = useDarkMode();
  const { items, start, end, above, below } = segment;
  const { path, side } = items[0]!.location;
  // The box's code, and each location's own lines as they were read with it, by index: their hash, which ticks are
  // made by, and whether they're reviewed. A location that is the whole cut takes the cut's hash; the others' own
  // lines are read alongside it, so a tick marks the lines on screen even if the file changes meanwhile.
  const [shown, setShown] = useState<{ cut: CodeCut; own: ReadonlyMap<number, CodeCut> }>();
  const [error, setError] = useState<string>();
  const indexes = items.map((s) => s.index).join(",");
  useEffect(() => {
    let current = true; // a newer request replaces this one's answer
    const whole = ({ location: l }: Indexed) => startOf(l) === start && l.line === end;
    const others = items.filter((s) => !whole(s));
    Promise.all([fetchCut(path, side, start, end, above, below), ...others.map(({ location: l }) => fetchCut(path, side, startOf(l), l.line, 0, 0))]).then(
      ([cut, ...owns]) => {
        if (!current) return;
        const own = new Map(others.map((s, i) => [s.index, owns[i]!]));
        for (const s of items) if (whole(s)) own.set(s.index, cut);
        setShown({ cut, own });
        setError(undefined);
      },
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [path, side, start, end, above, below, indexes]);
  const cut = shown?.cut;

  const header = (item: Indexed) => (
    <LocationHeader
      key={item.index}
      location={item.location}
      own={shown?.own.get(item.index)}
      marks={marks}
      onReviewed={(hash, r) => onReviewed(item.index, hash, r)}
      failure={failure?.index === item.index ? failure.message : undefined}
    />
  );
  // Locations that start where the box does have their headers above it; each later one's sits under the line before its first line.
  const top = items.filter((s) => startOf(s.location) === start);
  // The renderer rebuilds its rows whenever data or extendData is a new object, so each is made anew only when what it holds changes.
  const diff = cut?.diff;
  const data = useMemo(() => ({ oldFile: { fileName: path }, newFile: { fileName: path }, hunks: diff ? [diff] : [] }), [path, diff]);
  const extendData = useMemo(() => {
    const inline: Record<string, { data: Indexed[] }> = {};
    for (const item of items.slice(top.length)) (inline[startOf(item.location) - 1] ??= { data: [] }).data.push(item);
    return { [side === "LEFT" ? "oldFile" : "newFile"]: inline };
  }, [side, indexes, start]);
  return (
    <div style={{ marginTop: 16 }}>
      {top.map(header)}
      {error && <div style={{ fontSize: 12, opacity: 0.7 }}>{error}</div>}
      {cut && (
        <div className="code-view">
          {cut.diff === "" ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {sideName(side)} side</div>
          ) : (
            <>
              {cut.moreAbove && <More arrow="↑" onClick={onUp} />}
              <DiffView<Indexed[]>
                data={data}
                extendData={extendData}
                // split view asks both sides for a row; only the locations' side has one
                renderExtendLine={({ data }) => (data ? <div className="code-view-inline">{data.map(header)}</div> : null)}
                diffViewMode={viewType === ViewType.Split ? DiffModeEnum.Split : DiffModeEnum.Unified}
                diffViewWrap={false}
                diffViewHighlight={false}
                diffViewTheme={dark ? "dark" : "light"}
                diffViewFontSize={12}
              />
              {cut.moreBelow && <More arrow="↓" onClick={onDown} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** own: the location's own lines, read with its box's code; undefined until then. onReviewed, failure: as Props', for this location. */
type HeaderProps = {
  location: Location;
  own: CodeCut | undefined;
  marks: ReadonlyMap<string, boolean>;
  onReviewed: (hash: string, reviewed: boolean) => void;
  failure: string | undefined;
};

/** A location's place, its reviewed box, and what its lines do. */
function LocationHeader({ location: l, own, marks, onReviewed, failure }: HeaderProps) {
  const start = startOf(l);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7 }}>
          {l.path}:{start}
          {start !== l.line ? `-${l.line}` : ""} ({sideName(l.side)})
        </span>
        {own && (
          <label style={{ fontSize: 11, fontFamily: "system-ui" }}>
            <input type="checkbox" checked={marks.get(own.hash) ?? own.reviewed} onChange={(e) => onReviewed(own.hash, e.target.checked)} /> reviewed
          </label>
        )}
      </div>
      {failure && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 4 }}>Couldn't save: {failure}</div>}
      {l.text && <div className="location-text">{l.text}</div>}
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
