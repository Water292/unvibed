// Opens the viewer on a graph file:  node viewer/view.ts <graph.json>
//
// Starts Vite's development server (hot reload included) and answers
// /graph.json with the chosen file, which can be anywhere on disk. The page
// only ever asks for /graph.json, so nothing else on disk is exposed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type Plugin } from "vite";

const file = process.argv[2];
if (!file) {
  console.error("usage: node viewer/view.ts <graph.json>");
  process.exit(2);
}
const path = resolve(file);

const serveGraph: Plugin = {
  name: "serve-graph",
  configureServer(server) {
    server.middlewares.use("/graph.json", (_req, res) => {
      try {
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(path)); // read fresh on every request
      } catch {
        res.statusCode = 404;
        res.end(`can't read ${path}`);
      }
    });
  },
};

const server = await createServer({
  configFile: `${import.meta.dirname}/vite.config.ts`,
  plugins: [serveGraph],
});
await server.listen();
server.printUrls();
