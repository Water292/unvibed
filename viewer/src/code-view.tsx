// One location's code, drawn by react-diff-view, unified or split: line
// numbers on both sides, added lines green, deleted lines red. Each location
// comes as a small unified diff, holding only the location's own lines.
import { Diff, Hunk, parseDiff } from "react-diff-view";
import "react-diff-view/style/index.css";
import "./code-view.css";
import type { Location } from "../../shared/graph.ts";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * An empty diff means the file can't be read on the location's side; no diff means the server sent none for it.
 * In split view, removed lines are paired with the added lines replacing them (zip), first with first; unified keeps the diff's order.
 */
export function CodeView({ location: l, diff, viewType }: { location: Location; diff: string | undefined; viewType: ViewType }) {
  const start = l.start_line ?? l.line;
  const side = l.side === "LEFT" ? "base" : "head";
  const hunks = diff ? (parseDiff(diff, viewType === ViewType.Split ? { nearbySequences: "zip" } : {})[0]?.hunks ?? []) : [];
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {l.path}:{start}
        {start !== l.line ? `-${l.line}` : ""} ({side})
      </div>
      {diff !== undefined && (
        <div className="code-view">
          {hunks.length === 0 ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {side} side</div>
          ) : (
            <Diff viewType={viewType} diffType="modify" hunks={hunks}>
              {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
            </Diff>
          )}
        </div>
      )}
    </div>
  );
}
