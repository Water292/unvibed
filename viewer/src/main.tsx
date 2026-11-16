import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { MarkRequest } from "../../shared/graph-and-code.ts";
import type { Graph } from "../../shared/graph.ts";
import { ChatProvider, nodeOfThread, useChat } from "./chat.tsx";
import { clampPanelWidth, initialPanelWidth, Panel } from "./panel.tsx";
import { Flow } from "./react-flow/flow.tsx";
import { renderLocations } from "./rendered-location.ts";
import { isViewType, ViewType } from "./view-type.ts";

/** The graph, and the hashes of the lines already marked reviewed in this review. */
async function load(): Promise<{ graph: Graph; reviewed: string[] }> {
  const [graph, reviewed] = await Promise.all(
    ["/graph.json", "/reviewed"].map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }),
  );
  return { graph, reviewed };
}

/** Saves a mark; returns the server's message if it fails. */
async function sendMark(request: MarkRequest): Promise<string | undefined> {
  const res = await fetch("/mark", { method: "POST", body: JSON.stringify(request) });
  return res.ok ? undefined : await res.text();
}

// A link ending #restore=<JSON of this page's localStorage> puts those settings back, then drops the hash: how a
// saved demo state (scratch/demo-state.ts) brings back the browser's side. Opened on a page already showing, it reloads.
function restoreSettings() {
  if (!location.hash.startsWith("#restore=")) return false;
  try {
    for (const [k, v] of Object.entries(JSON.parse(decodeURIComponent(location.hash.slice("#restore=".length))) as Record<string, string>))
      localStorage.setItem(k, v);
  } catch {}
  history.replaceState(null, "", location.pathname);
  return true;
}
restoreSettings();
addEventListener("hashchange", () => restoreSettings() && location.reload());

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
  // The hashes marked reviewed: those marked when the page loaded, with each tick since added and each untick removed.
  // They tick each location, which colours the canvas's nodes and the panel's boxes, so every location with the same
  // lines follows a tick.
  const [reviewedHashes, setReviewedHashes] = useState<ReadonlySet<string>>(new Set());
  const locations = useMemo(() => graph && renderLocations(graph, reviewedHashes), [graph, reviewedHashes]);
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
      ({ graph, reviewed }) => current && (setGraph(graph), setReviewedHashes(new Set(reviewed))),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!graph || !locations) return null;
  const node = graph.nodes.find((n) => n.id === selected);
  // Saves the mark, then records it here, which ticks every location with the same lines. Returns why it couldn't be
  // saved, if it couldn't.
  const onMark = async (hash: string, reviewed: boolean) => {
    const failure = await sendMark({ hash, reviewed });
    if (failure !== undefined) return failure;
    setReviewedHashes((hashes) => {
      if (reviewed) return new Set([...hashes, hash]);
      return new Set([...hashes].filter((h) => h !== hash));
    });
    return undefined;
  };
  // The panel takes a share of the window, kept as the window is resized: once its edge has been dragged, the
  // share dragged to, for both views; until then each view's default for the window the page opened in.
  const share = draggedShare ?? initialPanelWidth(viewType, openingWidth) / openingWidth;
  const width = clampPanelWidth(Math.round(share * windowWidth), windowWidth);
  // where a chat anchor is, in a few words, for the staged bar: the node, and a location's file and lines
  const describe = (anchor: string) => {
    const [kind, rest = ""] = anchor.split(/:(.*)/s);
    const [id, index] = kind === "loc" ? rest.split("#") : [rest, undefined];
    const n = graph.nodes.find((n) => n.id === id);
    const l = index === undefined ? undefined : n?.code[Number(index)];
    const name = n?.title ?? id ?? anchor;
    if (!l) return name;
    const start = l.start_line ?? l.line;
    return `${name} · ${l.path.split("/").pop()}:${start}${start !== l.line ? `-${l.line}` : ""}`;
  };
  return (
    <ChatProvider selectNode={setSelected} describe={describe}>
    <div style={{ position: "relative", height: "100%" }}>
      <StagedFlow graph={graph} locations={locations} selected={selected} onSelect={setSelected} covered={node ? width : 0} />
      {node && (
        <Panel
          key={node.id}
          graph={graph}
          node={node}
          locations={locations.get(node.id)!}
          onMark={onMark}
          onSelect={setSelected}
          width={width}
          onWidth={changeWidth}
          viewType={viewType}
          onViewType={changeViewType}
        />
      )}
    </div>
    </ChatProvider>
  );
}

/** The canvas, with how many threads are staged in each node. */
function StagedFlow(props: Omit<Parameters<typeof Flow>[0], "staged">) {
  const { threads } = useChat();
  const staged = new Map<string, number>();
  for (const t of threads) {
    const node = t.stagedAt !== null ? nodeOfThread(t, threads) : undefined;
    if (node) staged.set(node, (staged.get(node) ?? 0) + 1);
  }
  return <Flow {...props} staged={staged} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
