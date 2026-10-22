// The only file that knows about React Flow: it turns the graph and its
// layout into React Flow's nodes and edges, in pixels, and draws them.
import { Background, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Graph } from "../../../src/graph.ts";
import { layout } from "../layout.ts";

const COLUMN_WIDTH = 340;
const ROW_HEIGHT = 120;
const NODE_WIDTH = 270;

export function Flow({ graph }: { graph: Graph }) {
  const cells = layout(graph);
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
      style: { width: NODE_WIDTH },
      // columns run left to right, so links leave from the right and arrive on the left
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => {
    const back = isBack(e.from, e.to);
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed },
      style: back ? { strokeDasharray: "5 4", opacity: 0.7 } : undefined,
    };
  });

  return (
    <ReactFlow nodes={nodes} edges={edges} colorMode="system" fitView minZoom={0.1}>
      <Background />
    </ReactFlow>
  );
}
