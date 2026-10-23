// One location's code, drawn by react-diff-view: line numbers on both sides,
// added lines green, deleted lines red. Each location has one hunk, holding
// only the location's own lines.
import { Diff, Hunk, type HunkData } from "react-diff-view";
import "react-diff-view/style/index.css";
import "./code-view.css";
import type { Location } from "../../src/graph.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** A hunk with no changes means the file can't be read on the location's side; no hunk means the server sent none for it. */
export function CodeView({ location: l, hunk }: { location: Location; hunk: HunkData | undefined }) {
  const start = l.start_line ?? l.line;
  const side = l.side === "LEFT" ? "base" : "head";
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {l.path}:{start}
        {start !== l.line ? `-${l.line}` : ""} ({side})
      </div>
      {hunk && (
        <div className="code-view">
          {hunk.changes.length === 0 ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {side} side</div>
          ) : (
            <Diff viewType="unified" diffType="modify" hunks={[hunk]}>
              {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
            </Diff>
          )}
        </div>
      )}
    </div>
  );
}
