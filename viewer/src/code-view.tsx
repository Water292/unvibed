// A node's code, drawn by @git-diff-view/react, unified or split: line
// numbers on both sides, added lines green, deleted lines red. Each location
// has its place, its reviewed box and its explanation above its lines. A
// file's locations come from the server as code boxes, holding only their
// own lines until ↑ or ↓ asks for more; once a location's lines meet the
// next one's, the server sends the two as one box, and the second's header
// sits inside it, at the line it starts on.
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useMemo, useState } from "react";
import "./code-view.css";
import type { CodeAnswer, CodeBox, Own } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
import { startOf, type Indexed } from "./group.ts";
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

/** Locations of a file on a side, each as start,end,above,below, from the server, as code boxes. */
async function fetchCode(path: string, side: Location["side"], ats: string[]): Promise<CodeAnswer> {
  const q = new URLSearchParams({ path, side });
  for (const at of ats) q.append("at", at);
  const res = await fetch(`/code?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const sideName = (side: Location["side"]) => (side === "LEFT" ? "base" : "head");

/** How many lines ↑ (above) and ↓ (below) have added to a location. */
type Widen = { above: number; below: number };

/** A location in a box: where it is in the node's list, and its own lines as read with the box. */
type Shown = Indexed & { own: Own };

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

/** A file's locations in one node: how many lines ↑ and ↓ have added to each, and the boxes the server cuts them into. */
export function LocationGroup({ group, ...rest }: Props) {
  const { path, side } = group[0]!.location;
  const [widened, setWidened] = useState<ReadonlyMap<number, Widen>>(new Map());
  const widen = (i: number) => widened.get(i) ?? { above: 0, below: 0 };
  const set = (i: number, w: Widen) => setWidened((m) => new Map(m).set(i, w));
  // what's on screen stays there until the answer for a wider request arrives
  const [answer, setAnswer] = useState<CodeAnswer>();
  const [error, setError] = useState<string>();
  const ats = group.map(({ location: l, index }) => [startOf(l), l.line, widen(index).above, widen(index).below].join(","));
  const request = ats.join(" ");
  useEffect(() => {
    let current = true; // a newer request replaces this one's answer
    fetchCode(path, side, ats).then(
      (a) => {
        if (!current) return;
        setAnswer(a);
        setError(undefined);
      },
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [path, side, request]);
  return (
    <>
      {error && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 16 }}>{error}</div>}
      {answer?.boxes.map((box) => {
        // the box's locations, by their place in the request, which is the group's order
        const items = box.items.map((i): Shown => ({ ...group[i]!, own: answer.own[i]! }));
        const first = items[0]!;
        const last = items.reduce((a, b) => (b.location.line > a.location.line ? b : a));
        return (
          <BoxView
            // a box keeps its first location as it takes in the next ones, so it keeps its place on screen
            key={first.index}
            box={box}
            items={items}
            side={side}
            path={path}
            // ↑ widens the first location, ↓ the last, each STEP lines past what the box shows
            onUp={() => set(first.index, { ...widen(first.index), above: startOf(first.location) - box.from + STEP })}
            onDown={() => set(last.index, { ...widen(last.index), below: box.to - last.location.line + STEP })}
            {...rest}
          />
        );
      })}
    </>
  );
}

type BoxProps = Omit<Props, "group"> & { box: CodeBox; items: Shown[]; path: string; side: Location["side"]; onUp: () => void; onDown: () => void };

/** One box: one location's lines, or several that met, with each location's header. */
function BoxView({ box, items, path, side, onUp, onDown, viewType, marks, onReviewed, failure }: BoxProps) {
  const dark = useDarkMode();
  const header = (item: Shown) => (
    <LocationHeader
      key={item.index}
      location={item.location}
      own={item.own}
      marks={marks}
      onReviewed={(hash, r) => onReviewed(item.index, hash, r)}
      failure={failure?.index === item.index ? failure.message : undefined}
    />
  );
  // The box's first location, and any that start where it does, have their headers above it; each later one's sits
  // under the line before its first line.
  const top = items.filter((s) => box.diff === "" || startOf(s.location) === startOf(items[0]!.location));
  // The renderer rebuilds its rows whenever data or extendData is a new object, so each is made anew only when what it holds changes.
  const data = useMemo(() => ({ oldFile: { fileName: path }, newFile: { fileName: path }, hunks: box.diff ? [box.diff] : [] }), [path, box.diff]);
  const extendData = useMemo(() => {
    const inline: Record<string, { data: Shown[] }> = {};
    for (const item of items.slice(top.length)) (inline[startOf(item.location) - 1] ??= { data: [] }).data.push(item);
    return { [side === "LEFT" ? "oldFile" : "newFile"]: inline };
  }, [side, items, top.length]);
  return (
    <div style={{ marginTop: 16 }}>
      {top.map(header)}
      <div className="code-view">
        {box.diff === "" ? (
          <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {sideName(side)} side</div>
        ) : (
          <>
            {box.moreAbove && <More arrow="↑" onClick={onUp} />}
            <DiffView<Shown[]>
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
            {box.moreBelow && <More arrow="↓" onClick={onDown} />}
          </>
        )}
      </div>
    </div>
  );
}

/** own: the location's own lines, read with its box's code. onReviewed, failure: as Props', for this location. */
type HeaderProps = {
  location: Location;
  own: Own;
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
        <label style={{ fontSize: 11, fontFamily: "system-ui" }}>
          <input type="checkbox" checked={marks.get(own.hash) ?? own.reviewed} onChange={(e) => onReviewed(own.hash, e.target.checked)} /> reviewed
        </label>
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
