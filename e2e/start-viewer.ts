// Checks a repo's graph.json against its code, starts the viewer on it, and waits until it answers.
import { expect } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";

const VIEW = join(import.meta.dirname, "../src/view.ts");
const CLI = join(import.meta.dirname, "../src/cli.ts");

export async function startViewer(dir: string, port: number, args: string[]) {
  const url = `http://127.0.0.1:${port}/`;
  // a test graph that doesn't match its code fails here, with check's output, not later in the browser
  execFileSync(process.execPath, [CLI, "check", "graph.json", ...args], { cwd: dir });
  const child = spawn(process.execPath, [VIEW, "graph.json", ...args, "--review", "e2e", "--port", String(port)], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
  await expect.poll(() => fetch(url).then((r) => r.ok, () => false), { timeout: 15_000 }).toBe(true);
  return { url, stop: () => void child.kill() };
}
