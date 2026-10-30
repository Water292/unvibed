import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { MarkRequest } from "../../shared/graph-and-code.ts";
import type { Graph } from "../../shared/graph.ts";
import { clampPanelWidth, initialPanelWidth, Panel } from "./panel.tsx";
import { Flow } from "./react-flow/flow.tsx";
import { isViewType, ViewType } from "./view-type.ts";

async function load(): Promise<Graph> {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Saves a mark; returns the server's message if it fails. */
async function sendMark(request: MarkRequest): Promise<string | undefined> {
  const res = await fetch("/mark", { method: "POST", body: JSON.stringify(request) });
  return res.ok ? undefined : await res.text();
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
  const [graph, setGraph] = useState<Graph>();
  // The marks made since the page loaded, by hash: they outrank what a box's code came with, so every box with the
  // same lines follows a tick, on screen or fetched later.
  const [marks, setMarks] = useState<ReadonlyMap<string, boolean>>(new Map());
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

  // In development React runs this twice when the page opens (StrictMode); the first run's answer is ignored, so
  // only one is drawn.
  useEffect(() => {
    let current = true;
    load().then(
      (g) => current && setGraph(g),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!graph) return null;
  const node = graph.nodes.find((n) => n.id === selected);
  // Saves the mark, then records it here, which ticks every location with the same lines. Returns why it couldn't be
  // saved, if it couldn't.
  const onMark = async (hash: string, mark: boolean) => {
    if (!hash) return "these lines can't be read, so they can't be marked";
    const failure = await sendMark({ hash, reviewed: mark });
    if (failure === undefined) setMarks((m) => new Map(m).set(hash, mark));
    return failure;
  };
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
          marks={marks}
          onMark={onMark}
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
