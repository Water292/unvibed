// /code on a viewer reading the working tree, where it reads files from disk: what it refuses to send.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Location } from "../shared/graph.ts";
import { tempRepo } from "../test/temp-repo.ts";
import { askCode } from "./ask-code.ts";
import { startViewer } from "./start-viewer.ts";

/** Makes a location on line 1 of path, after the change. The server doesn't read its hash. */
function createLineOneLocation(path: string): Location {
  return { id: randomUUID(), path, side: "RIGHT", line: 1, hash: "", added: 0, removed: 0, text: "" };
}

const APP_LINE_1 = createLineOneLocation("app.ts");
const SECRET_LINE_1 = createLineOneLocation("secret.txt");

let viewer: Awaited<ReturnType<typeof startViewer>>;
test.beforeAll(async ({}, { parallelIndex }) => {
  // app.ts committed; secret.txt on disk but ignored, like a .env file. No --head, so the head is the working tree.
  const { dir, git, write } = tempRepo();
  write("app.ts", "export const a = 1;\n");
  write(".gitignore", "secret.txt\n");
  git("add", ".");
  git("commit", "-qm", "base");
  write("secret.txt", "password\n");
  write("graph.json", JSON.stringify({ schema: "test", nodes: [], edges: [] }));
  viewer = await startViewer(dir, 4740 + parallelIndex, ["--base", "HEAD"]);
  // The places go in once the viewer is up, which checks graph.json against the code when it starts; it reads the
  // graph again for every request.
  const code = [APP_LINE_1, SECRET_LINE_1];
  write("graph.json", JSON.stringify({ schema: "test", nodes: [{ id: randomUUID(), title: "", text: "", code }], edges: [] }));
});
test.afterAll(() => viewer.stop());

test("an ignored file on disk comes back as an empty box, never its contents", async () => {
  // the handler checks the file before reading it; without the check, this would read secret.txt from disk
  const res = await askCode(viewer.url, { locations: [{ id: SECRET_LINE_1.id, above: 0, below: 0 }] });
  expect(await res.json()).toEqual({
    boxes: [{ items: [0], diff: "", from: { LEFT: 0, RIGHT: 0 }, to: { LEFT: 0, RIGHT: 0 }, moreAbove: false, moreBelow: false }],
    own: [{ hash: "", reviewed: false }],
  });
});

test("a location the graph doesn't have is refused, so the page is told to reload", async () => {
  const res = await askCode(viewer.url, { locations: [{ id: randomUUID(), above: 0, below: 0 }] });
  expect(res.status).toBe(404);
  expect(await res.text()).toContain("reload the page");
});

test("locations in two files are refused: a request is for one file", async () => {
  const res = await askCode(viewer.url, {
    locations: [
      { id: APP_LINE_1.id, above: 0, below: 0 },
      { id: SECRET_LINE_1.id, above: 0, below: 0 },
    ],
  });
  expect(res.status).toBe(400);
});

test("no other page can read its answers", async () => {
  // a request from another localhost page gets no permission to read the answer (cors is off)
  const res = await fetch(`${viewer.url}code`, {
    method: "POST",
    headers: { Origin: "http://localhost:5173", "content-type": "application/json" },
    body: JSON.stringify({ locations: [{ id: APP_LINE_1.id, above: 0, below: 0 }] }),
  });
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
});
