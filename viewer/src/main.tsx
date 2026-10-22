import { Background, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <ReactFlow nodes={[]} edges={[]} colorMode="system" fitView>
      <Background />
    </ReactFlow>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
