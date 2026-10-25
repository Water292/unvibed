// Opens the viewer on a graph file:
//
//   node src/view.ts <graph.json> [--base <rev>] [--head <rev>]
//
// Starts Vite's development server (hot reload included) and answers
// /graph.json with the chosen file, which can be anywhere on disk, together
// with the code each node points at, diffed between --base (default:
// merge-base of origin/main and HEAD) and --head (default: the working tree). The
// page only gets those, so nothing else on disk is exposed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer, type Plugin } from "vite";
import { defaultBase } from "./git.ts";
import type { Graph } from "../shared/graph.ts";
import { codeFor } from "./hunks.ts";

const usage = "usage: node src/view.ts <graph.json> [--base <rev>] [--head <rev>]";
let args;
try {
  args = parseArgs({ allowPositionals: true, options: { base: { type: "string" }, head: { type: "string" } } });
} catch (e) {
  console.error(`${(e as Error).message}\n${usage}`);
  process.exit(2);
}
const file = args.positionals[0];
if (!file) {
  console.error(usage);
  process.exit(2);
}
const path = resolve(file);
const base = args.values.base ?? defaultBase();
const head = args.values.head;

const serveGraph: Plugin = {
  name: "serve-graph",
  configureServer(server) {
    server.middlewares.use("/graph.json", (req, res) => {
      let graph: Graph;
      try {
        graph = JSON.parse(readFileSync(path, "utf8")); // read fresh on every request
      } catch {
        res.statusCode = 404;
        res.end(`can't read ${path}`);
        return;
      }
      try {
        res.setHeader("content-type", "application/json");
        const zip = new URL(req.url ?? "", "http://localhost").searchParams.get("zip") === "1"; // the page asks for ?zip=1 in split view
        res.end(JSON.stringify(codeFor(graph, base, head, zip)));
      } catch (e) {
        res.statusCode = 500;
        res.end(`can't read the code: ${(e as Error).message}`);
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
