// The only file that knows about React Flow: it turns the graph and its
// layout into React Flow's nodes and edges, in pixels, and draws them.
import { Background, MarkerType, Position, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../../../shared/graph.ts";
import { layout } from "../layout.ts";

const COLUMN_WIDTH = 340;
const ROW_HEIGHT = 120;
const NODE_WIDTH = 270;
const HIGHLIGHT = "#2563eb";
const DIM = 0.25;

/** The node and every node it links to or from. */
function neighbourhood(graph: Graph, id: string): Set<string> {
  const ids = new Set([id]);
  for (const e of graph.edges) {
    if (e.from === id) ids.add(e.to);
    if (e.to === id) ids.add(e.from);
  }
  return ids;
}

type Props = {
  graph: Graph;
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  /** Pixels on the right covered by something drawn over the canvas. */
  covered: number;
};

export function Flow({ graph, selected, onSelect, covered }: Props) {
  const cells = useMemo(() => layout(graph), [graph]);
  // The hovered node, else the selected one, is lit up with its links and
  // the nodes at their other ends; everything else fades back.
  const [hovered, setHovered] = useState<string>();
  const active = hovered ?? selected;
  const touches = (e: { from: string; to: string }) => e.from === active || e.to === active;
  const lit = active ? neighbourhood(graph, active) : new Set<string>();

  // Selecting a node brings it and its neighbours into view, in the part of
  // the canvas the side panel doesn't cover.
  const [flow, setFlow] = useState<ReactFlowInstance>();
  useEffect(() => {
    if (!flow || !selected) return;
    const nodes = [...neighbourhood(graph, selected)].map((id) => ({ id }));
    flow.fitView({ nodes, duration: 300, maxZoom: 1, padding: { x: "40px", y: "40px", right: `${covered + 40}px` } });
  }, [flow, graph, selected, covered]);

  // A link that doesn't point rightwards is the one closing a cycle; it's
  // drawn quietly so the main left-to-right reading stays clear.
  const isBack = (from: string, to: string) => cells.get(to)!.column <= cells.get(from)!.column;

  const nodes: Node[] = graph.nodes.map((n) => {
    const cell = cells.get(n.id)!;
    // Each link's note is shown in the node it points to, not on the line.
    const incoming = graph.edges.filter((e) => e.to === n.id);
    return {
      id: n.id,
      position: { x: cell.column * COLUMN_WIDTH, y: cell.row * ROW_HEIGHT },
      data: {
        label: (
          <div style={{ textAlign: "left" }}>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, opacity: 0.6 }}>{n.id}</div>
            <div style={{ fontSize: 13, lineHeight: 1.35 }}>{n.title}</div>
            {incoming.map((e) => (
              <div key={e.from} style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                ← {e.from}
                {e.note ? `: ${e.note}` : ""}
              </div>
            ))}
          </div>
        ),
      },
      style: {
        width: NODE_WIDTH,
        opacity: active && !lit.has(n.id) ? DIM : 1,
        ...(n.id === selected ? { borderColor: HIGHLIGHT, boxShadow: `0 0 0 1px ${HIGHLIGHT}` } : {}),
      },
      // columns run left to right, so links leave from the right and arrive on the left
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const back = isBack(e.from, e.to);
    const on = touches(e);
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, ...(on ? { color: HIGHLIGHT } : {}) },
      zIndex: on ? 1 : 0,
      style: {
        ...(back ? { strokeDasharray: "5 4" } : {}),
        ...(on ? { stroke: HIGHLIGHT, strokeWidth: 2 } : {}),
        opacity: active && !on ? DIM : back ? 0.7 : 1,
      },
    };
  });

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      colorMode="system"
      fitView
      minZoom={0.1}
      onInit={setFlow}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(undefined)}
      onNodeMouseEnter={(_, n) => setHovered(n.id)}
      onNodeMouseLeave={() => setHovered(undefined)}
    >
      <Background />
    </ReactFlow>
  );
}
