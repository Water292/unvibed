// One location's code, drawn by @git-diff-view/react, unified or split: line
// numbers on both sides, added lines green, deleted lines red. Each location
// comes as a small unified diff, holding only the location's own lines.
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { useEffect, useState } from "react";
import "./code-view.css";
import type { FileContents } from "../../shared/graph-and-code.ts";
import type { Location } from "../../shared/graph.ts";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

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

/**
 * An empty diff means the file can't be read on the location's side; no diff means the server sent none for it.
 * file is the whole file at the base (old) and the head (new): the renderer draws lines from it, including the
 * code of a location the PR didn't touch. (It could expand lines around a location from it too; see code-view.css.)
 */
export function CodeView({ location: l, diff, file, viewType }: { location: Location; diff: string | undefined; file: FileContents | undefined; viewType: ViewType }) {
  const dark = useDarkMode();
  const start = l.start_line ?? l.line;
  const side = l.side === "LEFT" ? "base" : "head";
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
        {l.path}:{start}
        {start !== l.line ? `-${l.line}` : ""} ({side})
      </div>
      {diff !== undefined && (
        <div className="code-view">
          {diff === "" ? (
            <div style={{ padding: "6px 8px", opacity: 0.7 }}>can't read this file on the {side} side</div>
          ) : (
            <DiffView
              data={{
                oldFile: { fileName: l.path, content: file?.old },
                newFile: { fileName: l.path, content: file?.new },
                hunks: [diff],
              }}
              diffViewMode={viewType === ViewType.Split ? DiffModeEnum.Split : DiffModeEnum.Unified}
              diffViewWrap={false}
              diffViewHighlight={false}
              diffViewTheme={dark ? "dark" : "light"}
              diffViewFontSize={12}
            />
          )}
        </div>
      )}
    </div>
  );
}
