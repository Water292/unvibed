// Opens the viewer on a graph file:
//
//   node src/view.ts <graph.json> [--base <rev>] [--head <rev>] [--port <n>] [--review <name>]
//
// Starts Vite's development server (hot reload included) and answers
// /graph.json with the chosen file, which can be anywhere on disk.
// /code?path=&side=&start=&end=[&above=&below=] answers with those lines of a
// file in the repo, diffed between --base (default: merge-base of origin/main
// and HEAD) and --head (default: the working tree), read when asked, and
// whether they're marked reviewed in this review: the one --review names,
// else the branch --head names, else the branch checked out at startup.
// Without --head the code is the working tree, so if another branch is checked
// out later, requests are refused until it's back. POST /mark records a mark.
// The page gets nothing else from disk. It listens on --port, failing if
// that's taken; without it, on the first free port from 4620.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { createServer, type Plugin } from "vite";
import { defaultBase, isRepoFile } from "./git.ts";
import type { Graph } from "../shared/graph.ts";
import { cutFor, EMPTY_CUT } from "./hunks.ts";
import { createTables, currentBranch, isBranch, mark } from "./review.ts";
import { z } from "zod";
import { CodeQuery, MarkRequest } from "../shared/graph-and-code.ts";

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
      let graph: Graph;
      try {
        graph = JSON.parse(readFileSync(path, "utf8")); // read fresh on every request
      } catch {
        res.statusCode = 404;
        res.end(`can't read ${path}`);
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(graph));
    });
    server.middlewares.use("/code", (req, res) => {
      const branchChange = describeBranchChange();
      if (branchChange) {
        res.statusCode = 409;
        res.end(branchChange);
        return;
      }
      const query = CodeQuery.safeParse(Object.fromEntries(new URL(req.url ?? "", `http://${req.headers.host}`).searchParams));
      if (!query.success) {
        res.statusCode = 400;
        res.end(z.prettifyError(query.error));
        return;
      }
      const { path: file, side, start, end, above, below } = query.data;
      try {
        // only a file in the repo on that side is read; for anything else, an empty cut, as for a file that can't be read
        const cut = isRepoFile(side === "LEFT" ? base : head, file)
          ? cutFor(file, side, start, end, above, below, base, head, review)
          : EMPTY_CUT;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(cut));
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
      let body: unknown;
      try {
        body = JSON.parse(await text(req));
      } catch {
        body = undefined; // not JSON: the schema below refuses it
      }
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
