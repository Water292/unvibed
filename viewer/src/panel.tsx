// The side panel for the selected node: its explanation, the nodes it links
// to and from, and the code it points at.
import type { FileContents } from "../../shared/graph-and-code.ts";
import type { Graph, Node } from "../../shared/graph.ts";
import { CodeView } from "./code-view.tsx";
import { ViewType } from "./view-type.ts";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** The panel floats over the right of the canvas, this many pixels wide; wider for a split diff, which shows base and head side by side. */
export const panelWidth = (viewType: ViewType) =>
  viewType === ViewType.Split ? Math.min(1000, Math.round(window.innerWidth * 0.65)) : Math.min(560, Math.round(window.innerWidth * 0.45));

/** diffsForNode: one unified diff per location of the node, in order. files: the files they're in, by path. width: panelWidth's, worked out once by the caller, which also tells the canvas. */
type Props = {
  graph: Graph;
  node: Node;
  diffsForNode: string[];
  files: Record<string, FileContents>;
  onSelect: (id: string | undefined) => void;
  width: number;
  viewType: ViewType;
  onViewType: (viewType: ViewType) => void;
};

export function Panel({ graph, node, diffsForNode, files, onSelect, width, viewType, onViewType }: Props) {
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
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width,
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
      {node.code.map((location, i) => (
        <CodeView key={i} location={location} diff={diffsForNode[i]} file={files[location.path]} viewType={viewType} />
      ))}
    </aside>
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
