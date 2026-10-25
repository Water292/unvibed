import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GraphAndCode } from "../../shared/graph-and-code.ts";
import { Panel, panelWidth } from "./panel.tsx";
import { Flow } from "./react-flow/flow.tsx";
import { isViewType, ViewType } from "./view-type.ts";

async function load(): Promise<GraphAndCode> {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// The diff view chosen last time, kept in this browser; unified if none, not a view, or storage is unavailable.
const VIEW_TYPE_KEY = "unvibed.viewType";
function savedViewType(): ViewType {
  try {
    const saved = localStorage.getItem(VIEW_TYPE_KEY);
    return isViewType(saved) ? saved : ViewType.Unified;
  } catch {
    return ViewType.Unified;
  }
}
function saveViewType(viewType: ViewType) {
  try {
    localStorage.setItem(VIEW_TYPE_KEY, viewType);
  } catch {}
}

function App() {
  const [data, setData] = useState<GraphAndCode>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [viewType, setViewType] = useState(savedViewType);
  const changeViewType = (v: ViewType) => (setViewType(v), saveViewType(v));

  useEffect(() => {
    load().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!data) return null;
  const { graph, perNodeDiffs } = data;
  const node = graph.nodes.find((n) => n.id === selected);
  const width = panelWidth(viewType);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <Flow graph={graph} selected={selected} onSelect={setSelected} covered={node ? width : 0} />
      {node && (
        <Panel
          graph={graph}
          node={node}
          diffsForNode={perNodeDiffs[node.id] ?? []}
          onSelect={setSelected}
          width={width}
          viewType={viewType}
          onViewType={changeViewType}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
