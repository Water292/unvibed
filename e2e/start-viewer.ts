// Stamps a repo's graph.json, starts the viewer on it, and waits until it answers.
import { expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";

const VIEW = join(import.meta.dirname, "../src/view.ts");
const CLI = join(import.meta.dirname, "../src/cli.ts");

/** What a test's graph puts in a location's stored fields, which startViewer stamps. */
export const UNSTAMPED = { hash: "", added: 0, removed: 0 };

export async function startViewer(dir: string, port: number, args: string[]) {
  const url = `http://127.0.0.1:${port}/`;
  execFileSync(process.execPath, [CLI, "stamp", "graph.json", ...args], { cwd: dir });
  const child = spawn(process.execPath, [VIEW, "graph.json", ...args, "--review", "e2e", "--port", String(port)], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
  await expect.poll(() => fetch(url).then((r) => r.ok, () => false), { timeout: 15_000 }).toBe(true);
  return { url, stop: () => void child.kill() };
}
