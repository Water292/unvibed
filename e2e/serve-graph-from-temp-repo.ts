// A graph served from a temp repo by the viewer, started once for a spec file's tests.
import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import type { Graph } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";

const VIEW = join(import.meta.dirname, "../src/view.ts");

type Repo = ReturnType<typeof tempRepo>;

/**
 * Before the file's tests: a temp repo made by setup, the graph written into it, and the viewer serving it with
 * args (--base, --head) and the review "e2e" on a free port. After them, the viewer stops. served.url and served.repo
 * are set once the viewer answers.
 */
export function serveGraphFromTempRepo(graph: Graph, setup: (repo: Repo) => void, args: string[]) {
  const served = { url: "", repo: undefined as unknown as Repo };
  let server: ChildProcess;
  test.beforeAll(async () => {
    served.repo = tempRepo();
    setup(served.repo);
    served.repo.write("graph.json", JSON.stringify(graph));
    const port = await freePort();
    served.url = `http://127.0.0.1:${port}/`;
    server = spawn(process.execPath, [VIEW, "graph.json", ...args, "--review", "e2e", "--port", String(port)], { cwd: served.repo.dir, stdio: ["ignore", "ignore", "inherit"] });
    await expect.poll(() => fetch(served.url).then((r) => r.ok, () => false), { timeout: 15_000 }).toBe(true);
  });
  test.afterAll(() => void server.kill());
  return served;
}

/** A setup with two commits, the base and the head, that differ in one file; serve it with BASE_AND_HEAD. */
export const baseAndHead = (path: string, base: string, head: string) => ({ git, write }: Repo) => {
  write(path, base);
  git("add", ".");
  git("commit", "-qm", "base");
  write(path, head);
  git("commit", "-qam", "head");
};
export const BASE_AND_HEAD = ["--base", "HEAD~1", "--head", "HEAD"];

/** A setup with the base committed and one file's change left in the working tree; serve it with BASE_AND_WORKING_TREE. */
export const baseAndWorkingTree = (path: string, base: string, head: string) => ({ git, write }: Repo) => {
  write(path, base);
  git("add", ".");
  git("commit", "-qm", "base");
  write(path, head);
};
export const BASE_AND_WORKING_TREE = ["--base", "HEAD"];

/** A port nothing is listening on: the system picks one, and it's released for the viewer to take. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}
