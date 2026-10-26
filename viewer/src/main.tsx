import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { GraphAndCode } from "../../shared/graph-and-code.ts";
import { clampPanelWidth, initialPanelWidth, Panel } from "./panel.tsx";
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

// The share of the window's width the panel was last dragged to, kept in this browser; undefined if never dragged,
// not a share (a number between 0 and 1), or storage is unavailable.
const PANEL_SHARE_KEY = "unvibed.panelShare";
function savedPanelShare(): number | undefined {
  try {
    const saved = Number(localStorage.getItem(PANEL_SHARE_KEY));
    return saved > 0 && saved < 1 ? saved : undefined;
  } catch {
    return undefined;
  }
}
function savePanelShare(share: number) {
  try {
    localStorage.setItem(PANEL_SHARE_KEY, String(share));
  } catch {}
}

function App() {
  const [data, setData] = useState<GraphAndCode>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [viewType, setViewType] = useState(savedViewType);
  const changeViewType = (v: ViewType) => (setViewType(v), saveViewType(v));
  // The window's width, kept current as the window is resized, so the panel's width follows it.
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resized = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  // The window's width when the page opened, which each view's default share is worked out for.
  const [openingWidth] = useState(window.innerWidth);
  // The share of the window's width the panel's edge was dragged to; changeWidth turns a dragged width into one.
  const [draggedShare, setDraggedShare] = useState(savedPanelShare);
  const changeWidth = (w: number) => (setDraggedShare(w / windowWidth), savePanelShare(w / windowWidth));

  useEffect(() => {
    load().then(setData, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!data) return null;
  const { graph, perNodeDiffs, files } = data;
  const node = graph.nodes.find((n) => n.id === selected);
  // The panel takes a share of the window, kept as the window is resized: once its edge has been dragged, the
  // share dragged to, for both views; until then each view's default for the window the page opened in.
  const share = draggedShare ?? initialPanelWidth(viewType, openingWidth) / openingWidth;
  const width = clampPanelWidth(Math.round(share * windowWidth), windowWidth);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <Flow graph={graph} selected={selected} onSelect={setSelected} covered={node ? width : 0} />
      {node && (
        <Panel
          graph={graph}
          node={node}
          diffsForNode={perNodeDiffs[node.id] ?? []}
          files={files}
          onSelect={setSelected}
          width={width}
          onWidth={changeWidth}
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
