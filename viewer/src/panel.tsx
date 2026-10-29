// The side panel for the selected node: its explanation, the nodes it links
// to and from, and the code it points at, with a reviewed box on each
// location.
import { useState, type PointerEvent } from "react";
import type { FileContents, LocationView } from "../../shared/graph-and-code.ts";
import type { Graph, Node } from "../../shared/graph.ts";
import { CodeView } from "./code-view.tsx";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** The panel floats over the right of the canvas, opening this many pixels wide in a window windowWidth wide; wider for a split diff, which shows base and head side by side. */
export const initialPanelWidth = (viewType: ViewType, windowWidth: number) =>
  viewType === ViewType.Split ? Math.min(1000, Math.round(windowWidth * 0.65)) : Math.min(560, Math.round(windowWidth * 0.45));

/** Dragging the panel's edge goes no narrower than this, and leaves at least CANVAS_LEFT pixels of canvas showing to its left. */
const MIN_WIDTH = 320;
const CANVAS_LEFT = 120;
export const clampPanelWidth = (width: number, windowWidth: number) => Math.max(MIN_WIDTH, Math.min(width, windowWidth - CANVAS_LEFT));

type Props = {
  graph: Graph;
  node: Node;
  locations: LocationView[];
  files: Record<string, FileContents>;
  reviewed: ReadonlySet<string>;
  onMark: (view: LocationView, reviewed: boolean) => Promise<string | undefined>;
  onSelect: (id: string | undefined) => void;
  width: number;
  onWidth: (width: number) => void;
  viewType: ViewType;
  onViewType: (viewType: ViewType) => void;
};

export function Panel({ graph, node, locations, files, reviewed, onMark, onSelect, width, onWidth, viewType, onViewType }: Props) {
  // The last mark that couldn't be saved: which location, and why.
  const [failure, setFailure] = useState<{ index: number; message: string }>();
  const markAndReport = async (index: number, view: LocationView, mark: boolean) => {
    setFailure(undefined);
    const message = await onMark(view, mark);
    if (message !== undefined) setFailure({ index, message });
  };
  // While the edge is being dragged only the panel follows it; the new width
  // is reported once, on release, so the canvas refits once rather than on
  // every move.
  const [dragged, setDragged] = useState<number>();
  const shown = dragged ?? width;
  // the width that puts the panel's left edge under the pointer
  const widthAt = (e: PointerEvent<HTMLElement>) => clampPanelWidth(e.currentTarget.parentElement!.getBoundingClientRect().right - e.clientX, window.innerWidth);
  const links = (ids: { id: string; note?: string }[], arrow: string) =>
    ids.map(({ id, note }) => (
      <div key={id} style={{ fontSize: 12, marginTop: 4 }}>
        {arrow}{" "}
        <a href="#" onClick={(e) => (e.preventDefault(), onSelect(id))} style={{ fontFamily: MONO }}>
          {id}
        </a>
        {note ? <span style={{ opacity: 0.7 }}>: {note}</span> : null}
      </div>
    ));
  const outgoing = graph.edges.filter((e) => e.from === node.id).map((e) => ({ id: e.to, note: e.note }));
  const incoming = graph.edges.filter((e) => e.to === node.id).map((e) => ({ id: e.from, note: e.note }));

  return (
    <>
      <div
        title="Drag to resize"
        onPointerDown={(e) => (e.preventDefault(), e.currentTarget.setPointerCapture(e.pointerId), setDragged(width))}
        onPointerMove={(e) => dragged !== undefined && setDragged(widthAt(e))}
        onPointerUp={(e) => dragged !== undefined && (onWidth(widthAt(e)), setDragged(undefined))}
        style={{ position: "absolute", top: 0, bottom: 0, right: shown - 4, width: 8, cursor: "col-resize", zIndex: 1 }}
      />
      <aside
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: shown,
          boxSizing: "border-box",
          overflow: "auto",
          borderLeft: "1px solid rgba(128, 128, 128, 0.3)",
          padding: "12px 16px",
          fontFamily: "system-ui",
          background: "Canvas",
          color: "CanvasText",
          colorScheme: "light dark",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: MONO, fontSize: 12, opacity: 0.6 }}>{node.id}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <ViewToggle viewType={viewType} onViewType={onViewType} />
            <button onClick={() => onSelect(undefined)} title="Close">✕</button>
          </div>
        </div>
        <h2 style={{ fontSize: 16, margin: "4px 0 8px" }}>{node.title}</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{node.text}</p>
        {links(incoming, "←")}
        {links(outgoing, "→")}
        {locations.map((view, i) => (
          <CodeView
            key={i}
            location={view.location}
            diff={view.diff}
            file={files[view.location.path]}
            viewType={viewType}
            reviewed={reviewed.has(view.hash)}
            onReviewed={(r) => markAndReport(i, view, r)}
            failure={failure?.index === i ? failure.message : undefined}
          />
        ))}
      </aside>
    </>
  );
}

/** viewType: the view now shown; onViewType: called with the view a click picks. */
type ViewToggleProps = { viewType: ViewType; onViewType: (viewType: ViewType) => void };

/** One button per ViewType, labelled with its name, in the enum's order; the current one is pressed. */
function ViewToggle({ viewType, onViewType }: ViewToggleProps) {
  return (
    <div role="group" aria-label="Diff view" style={{ display: "flex" }}>
      {Object.entries(ViewType).map(([label, v], i) => (
        <button
          key={v}
          aria-pressed={viewType === v}
          onClick={() => onViewType(v)}
          style={{
            fontSize: 11,
            padding: "2px 8px",
            border: "1px solid rgba(128, 128, 128, 0.5)",
            borderRadius: i === 0 ? "4px 0 0 4px" : "0 4px 4px 0",
            marginLeft: i === 0 ? 0 : -1,
            background: viewType === v ? "rgba(128, 128, 128, 0.3)" : "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
