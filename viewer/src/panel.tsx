// The side panel for the selected node: its explanation, the nodes it links
// to and from, and the code it points at.
import type { HunkData } from "react-diff-view";
import type { Graph, Node } from "../../src/graph.ts";
import { CodeView } from "./code-view.tsx";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** The panel floats over the right of the canvas, this many pixels wide. */
export const panelWidth = () => Math.min(560, Math.round(window.innerWidth * 0.45));

/** hunksForNode: one hunk per location of the node, in order. */
type Props = { graph: Graph; node: Node; hunksForNode: HunkData[]; onSelect: (id: string | undefined) => void };

export function Panel({ graph, node, hunksForNode, onSelect }: Props) {
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
        width: panelWidth(),
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
        <button onClick={() => onSelect(undefined)} title="Close">✕</button>
      </div>
      <h2 style={{ fontSize: 16, margin: "4px 0 8px" }}>{node.title}</h2>
      <p style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{node.text}</p>
      {links(incoming, "←")}
      {links(outgoing, "→")}
      {node.code.map((location, i) => (
        <CodeView key={i} location={location} hunk={hunksForNode[i]} />
      ))}
    </aside>
  );
}
