// Opens the viewer on a graph file:
//
//   node src/view.ts <graph.json> [--base <rev>] [--head <rev>] [--port <n>] [--review <name>]
//
// Starts Vite's development server (hot reload included) and answers
// /graph.json with the chosen file, which can be anywhere on disk.
// POST /code, with locations of the graph by id and how far ↑ / ↓ widened
// each, answers with their lines of a file in the repo, as code boxes, diffed between --base (default: merge-base of origin/main
// and HEAD) and --head (default: the working tree), read when asked, and
// whether they're marked reviewed in this review: the one --review names,
// else the branch --head names, else the branch checked out at startup.
// Without --head the code is the working tree, so if another branch is checked
// out later, requests are refused until it's back. POST /mark records a mark.
// The page gets nothing else from disk. It listens on --port, failing if
// that's taken; without it, on the first free port from 4620.
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { createServer, type Plugin } from "vite";
import { defaultBase, isRepoFile } from "./git.ts";
import type { Graph } from "../shared/graph.ts";
import { codeFor } from "./hunks.ts";
import { createTables, currentBranch, isBranch, mark } from "./review.ts";
import { z } from "zod";
import { CodeRequest, MarkRequest } from "../shared/graph-and-code.ts";

const usage = "usage: node src/view.ts <graph.json> [--base <rev>] [--head <rev>] [--port <n>] [--review <name>]";
let args;
try {
  args = parseArgs({ allowPositionals: true, options: { base: { type: "string" }, head: { type: "string" }, port: { type: "string" }, review: { type: "string" } } });
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
const port = args.values.port === undefined ? undefined : Number(args.values.port);
if (port !== undefined && !Number.isInteger(port)) {
  console.error(`--port must be a number\n${usage}`);
  process.exit(2);
}
if (head !== undefined && args.values.review === undefined && !isBranch(head)) {
  console.error(`${head} isn't a branch: name the review with --review <name>\n${usage}`);
  process.exit(2);
}
const startingBranch = currentBranch();
const review = args.values.review ?? head ?? startingBranch;
if (review === undefined) {
  console.error(`no branch is checked out: name the review with --review <name>\n${usage}`);
  process.exit(2);
}
createTables();
/** Why requests are refused: the working tree is shown and another branch is checked out than at startup. */
function describeBranchChange(): string | undefined {
  if (head !== undefined) return undefined;
  const branch = currentBranch();
  if (branch === startingBranch) return undefined;
  return `${startingBranch ?? "a detached HEAD"} was checked out when the viewer started, ${branch ?? "a detached HEAD"} is now: check it out again or restart the viewer`;
}

/** The graph file, read fresh, or undefined if it can't be read. */
function readGraph(): Graph | undefined {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** A request's body as JSON, or undefined if it isn't JSON: the schema it's checked against then refuses it. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  try {
    return JSON.parse(await text(req));
  } catch {
    return undefined;
  }
}

const serveGraph: Plugin = {
  name: "serve-graph",
  configureServer(server) {
    server.middlewares.use("/graph.json", (_req, res) => {
      const branchChange = describeBranchChange();
      if (branchChange) {
        res.statusCode = 409;
        res.end(branchChange);
        return;
      }
      const graph = readGraph();
      if (!graph) {
        res.statusCode = 404;
        res.end(`can't read ${path}`);
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(graph));
    });
    server.middlewares.use("/code", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST the locations to show");
        return;
      }
      const body = await readJson(req);
      const branchChange = describeBranchChange();
      if (branchChange) {
        res.statusCode = 409;
        res.end(branchChange);
        return;
      }
      const request = CodeRequest.safeParse(body);
      if (!request.success) {
        res.statusCode = 400;
        res.end(z.prettifyError(request.error));
        return;
      }
      const graph = readGraph();
      if (!graph) {
        res.statusCode = 404;
        res.end(`can't read ${path}`);
        return;
      }
      // the request names locations by id; the graph has each one's file, side and lines
      const locationsById = new Map(graph.nodes.flatMap((node) => node.code.map((location) => [location.id, location])));
      const missing = request.data.locations.find(({ id }) => !locationsById.has(id));
      if (missing) {
        res.statusCode = 404;
        res.end(`no location ${missing.id} in ${path}: it changed since the page loaded, so reload the page`);
        return;
      }
      const widened = request.data.locations.map(({ id, above, below }) => ({ location: locationsById.get(id)!, above, below }));
      const files = [...new Set(widened.map(({ location }) => location.path))];
      if (files.length > 1) {
        res.statusCode = 400;
        res.end(`the locations are in ${files.length} files: ask for one file's at a time`);
        return;
      }
      const file = files[0]!;
      try {
        // the file is read only in a version where it's in the repo; one where it isn't is treated as missing
        const answer = codeFor(file, widened, base, head, review, { LEFT: isRepoFile(base, file), RIGHT: isRepoFile(head, file) });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(answer));
      } catch (e) {
        res.statusCode = 500;
        res.end(`can't read the code: ${(e as Error).message}`);
      }
    });
    server.middlewares.use("/mark", async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("POST a mark");
        return;
      }
      const body = await readJson(req);
      const branchChange = describeBranchChange();
      if (branchChange) {
        res.statusCode = 409;
        res.end(branchChange);
        return;
      }
      const request = MarkRequest.safeParse(body);
      if (!request.success) {
        res.statusCode = 400;
        res.end(z.prettifyError(request.error));
        return;
      }
      try {
        mark(review, request.data.hash, request.data.reviewed);
        res.end("ok");
      } catch (e) {
        res.statusCode = 500;
        res.end((e as Error).message);
      }
    });
  },
};

const server = await createServer({
  configFile: `${import.meta.dirname}/vite.config.ts`,
  plugins: [serveGraph],
  ...(port === undefined ? {} : { server: { port, strictPort: true } }),
});
await server.listen();
server.printUrls();
