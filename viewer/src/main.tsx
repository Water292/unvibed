// The standalone viewer: the graph the server was started on, with our chat.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Graph } from "../../shared/graph.ts";
import { Askable, ChatProvider, nodeOfThread, Threads, useChat } from "./chat.tsx";
import { GraphReview } from "./graph-review.tsx";

/** The graph the server was started on. */
async function loadGraph(): Promise<Graph> {
  const res = await fetch("/graph.json");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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

// The standalone viewer's chat: text can be asked about, and threads staged to send to Claude Code.
const CHAT_HOST = { Askable, Threads };

function App() {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  // In development React runs this twice when the page opens (StrictMode); the first run's answer is ignored, so
  // only one is drawn.
  useEffect(() => {
    let current = true;
    loadGraph().then(
      (graph) => current && setGraph(graph),
      (e: Error) => current && setError(e.message),
    );
    return () => {
      current = false;
    };
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!graph) return null;
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
      <StagedGraphReview graph={graph} selected={selected} onSelect={setSelected} />
    </ChatProvider>
  );
}

/** The graph to review, with our chat, and how many threads are staged in each node. */
function StagedGraphReview(props: { graph: Graph; selected: string | undefined; onSelect: (id: string | undefined) => void }) {
  const { threads } = useChat();
  const staged = new Map<string, number>();
  for (const t of threads) {
    const node = t.stagedAt !== null ? nodeOfThread(t, threads) : undefined;
    if (node) staged.set(node, (staged.get(node) ?? 0) + 1);
  }
  return <GraphReview {...props} host={CHAT_HOST} staged={staged} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
