// A graph to review: the canvas, and the side panel for the selected node,
// with each location's code and reviewed box read from and saved to the
// routes the host names.
import { useEffect, useMemo, useState } from "react";
import type { MarkRequest } from "../../shared/graph-and-code.ts";
import type { Graph } from "../../shared/graph.ts";
import { HostProvider, NO_HOST, type Host } from "./host.tsx";
import { clampPanelWidth, initialPanelWidth, Panel } from "./panel.tsx";
import { Flow } from "./react-flow/flow.tsx";
import { renderLocations } from "./rendered-location.ts";
import { isViewType, ViewType } from "./view-type.ts";

/** The hashes of the lines already marked reviewed in this review. */
async function loadReviewed(routes: string): Promise<string[]> {
  const res = await fetch(`${routes}/reviewed`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Saves a mark; returns the server's message if it fails. */
async function sendMark(routes: string, request: MarkRequest): Promise<string | undefined> {
  const res = await fetch(`${routes}/mark`, { method: "POST", body: JSON.stringify(request) });
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

type Props = {
  graph: Graph;
  /** Where the routes are, and how text is asked about; unset parts are the page's own routes, and no asking. */
  host?: Partial<Host>;
  /** The selected node's id, whose panel is open; undefined for none. */
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  /** How many threads are staged in each node, by id, shown on its box; none if unset. */
  staged?: ReadonlyMap<string, number>;
};

const NONE_STAGED: ReadonlyMap<string, number> = new Map();

export function GraphReview({ graph, host, selected, onSelect, staged = NONE_STAGED }: Props) {
  const given = { ...NO_HOST, ...host };
  const routes = given.routes;
  // The hashes marked reviewed: those marked when the page loaded, with each tick since added and each untick removed.
  // They tick each location, which colours the canvas's nodes and the panel's boxes, so every location with the same
  // lines follows a tick. Undefined until loaded.
  const [reviewedHashes, setReviewedHashes] = useState<ReadonlySet<string>>();
  const locations = useMemo(() => reviewedHashes && renderLocations(graph, reviewedHashes), [graph, reviewedHashes]);
  const [error, setError] = useState<string>();
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
    loadReviewed(routes).then(
      (reviewed) => current && setReviewedHashes(new Set(reviewed)),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, [routes]);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!locations) return null;
  const node = graph.nodes.find((n) => n.id === selected);
  // Saves the mark, then records it here, which ticks every location with the same lines. Returns why it couldn't be
  // saved, if it couldn't.
  const onMark = async (hash: string, reviewed: boolean) => {
    const failure = await sendMark(routes, { hash, reviewed });
    if (failure !== undefined) return failure;
    // a box can only be ticked once the reviewed hashes have loaded, so they're there
    setReviewedHashes((hashes) => {
      if (reviewed) return new Set([...hashes!, hash]);
      return new Set([...hashes!].filter((h) => h !== hash));
    });
    return undefined;
  };
  // The panel takes a share of the window, kept as the window is resized: once its edge has been dragged, the
  // share dragged to, for both views; until then each view's default for the window the page opened in.
  const share = draggedShare ?? initialPanelWidth(viewType, openingWidth) / openingWidth;
  const width = clampPanelWidth(Math.round(share * windowWidth), windowWidth);
  return (
    <HostProvider value={given}>
      <div style={{ position: "relative", height: "100%" }}>
        <Flow graph={graph} locations={locations} selected={selected} onSelect={onSelect} covered={node ? width : 0} staged={staged} />
        {node && (
          <Panel
            key={node.id}
            graph={graph}
            node={node}
            locations={locations.get(node.id)!}
            onMark={onMark}
            onSelect={onSelect}
            width={width}
            onWidth={changeWidth}
            viewType={viewType}
            onViewType={changeViewType}
          />
        )}
      </div>
    </HostProvider>
  );
}
