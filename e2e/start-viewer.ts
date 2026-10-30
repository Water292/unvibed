// Starts the viewer in a repo that has a graph.json, and waits until it answers.
import { expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";

const VIEW = join(import.meta.dirname, "../src/view.ts");

export async function startViewer(dir: string, port: number, args: string[]) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, [VIEW, "graph.json", ...args, "--review", "e2e", "--port", String(port)], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
  await expect.poll(() => fetch(url).then((r) => r.ok, () => false), { timeout: 15_000 }).toBe(true);
  return { url, stop: () => void child.kill() };
}
