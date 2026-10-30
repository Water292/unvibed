// One location's code, drawn by @git-diff-view/react, unified or split: line
// numbers on both sides, added lines green, deleted lines red. Each box
// fetches its location as a small unified diff, holding only the location's
// own lines until ↑ or ↓ asks for more.
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useState } from "react";
import "./code-view.css";
import type { CodeCut } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
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

/** A location's lines, with above / below more lines, from the server. */
async function fetchCut(l: Location, above: number, below: number): Promise<CodeCut> {
  const q = new URLSearchParams({
    path: l.path,
    side: l.side,
    start: String(l.start_line ?? l.line),
    end: String(l.line),
    above: String(above),
    below: String(below),
  });
  const res = await fetch(`/code?${q}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * marks: the marks made since the page loaded, by hash; the box is ticked by its code's hash there, else by what its
 * code came with. onReviewed: called with that hash when the box is ticked or cleared. failure: why the last tick couldn't be saved,
 * if it couldn't.
 */
type Props = {
  location: Location;
  viewType: ViewType;
  marks: ReadonlyMap<string, boolean>;
  onReviewed: (hash: string, reviewed: boolean) => void;
  failure: string | undefined;
};

/** The box keeps how many lines ↑ and ↓ have added (above, below) and shows the code it has until a wider cut arrives. */
export function CodeView({ location: l, viewType, marks, onReviewed, failure }: Props) {
  const dark = useDarkMode();
  const [above, setAbove] = useState(0);
  const [below, setBelow] = useState(0);
  const [cut, setCut] = useState<CodeCut>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true; // a newer request replaces this one's answer
    fetchCut(l, above, below).then(
      (c) => current && (setCut(c), setError(undefined)),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [l, above, below]);

  const start = l.start_line ?? l.line;
  const side = l.side === "LEFT" ? "base" : "head";
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7 }}>
          {l.path}:{start}
          {start !== l.line ? `-${l.line}` : ""} ({side})
        </span>
        {cut && (
          <label style={{ fontSize: 11 }}>
            <input type="checkbox" checked={marks.get(cut.hash) ?? cut.reviewed} onChange={(e) => onReviewed(cut.hash, e.target.checked)} /> reviewed
          </label>
        )}
      </div>
      {failure && <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 4 }}>Couldn't save: {failure}</div>}
      {error && <div style={{ fontSize: 12, opacity: 0.7 }}>{error}</div>}
      {cut && (
        <div className="code-view">
          {cut.diff === "" ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {side} side</div>
          ) : (
            <>
              {cut.moreAbove && <More arrow="↑" onClick={() => setAbove(above + STEP)} />}
              <DiffView
                data={{ oldFile: { fileName: l.path }, newFile: { fileName: l.path }, hunks: [cut.diff] }}
                diffViewMode={viewType === ViewType.Split ? DiffModeEnum.Split : DiffModeEnum.Unified}
                diffViewWrap={false}
                diffViewHighlight={false}
                diffViewTheme={dark ? "dark" : "light"}
                diffViewFontSize={12}
              />
              {cut.moreBelow && <More arrow="↓" onClick={() => setBelow(below + STEP)} />}
            </>
          )}
        </div>
      )}
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
