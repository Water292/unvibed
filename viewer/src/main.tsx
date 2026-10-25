import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GraphAndCode } from "../../shared/graph-and-code.ts";
import { Panel, panelWidth } from "./panel.tsx";
import { Flow } from "./react-flow/flow.tsx";

async function load(): Promise<GraphAndCode> {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function App() {
  const [data, setData] = useState<GraphAndCode>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    load().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!data) return null;
  const { graph, perNodeHunks } = data;
  const node = graph.nodes.find((n) => n.id === selected);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <Flow graph={graph} selected={selected} onSelect={setSelected} covered={node ? panelWidth() : 0} />
      {node && <Panel graph={graph} node={node} hunksForNode={perNodeHunks[node.id] ?? []} onSelect={setSelected} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
