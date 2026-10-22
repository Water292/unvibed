import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Graph } from "../../src/graph.ts";
import { Flow } from "./react-flow/flow.tsx";

function App() {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    fetch("/graph.json")
      .then(async (res) => (res.ok ? setGraph(await res.json()) : setError(await res.text())))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ padding: 16, fontFamily: "system-ui" }}>{error}</p>;
  if (!graph) return null;
  return <Flow graph={graph} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
