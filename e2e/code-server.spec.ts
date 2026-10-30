// /code on a viewer reading the working tree, where it reads files from disk: what it refuses to send.
import { expect, test } from "@playwright/test";
import { tempRepo } from "../test/temp-repo.ts";
import { startViewer } from "./start-viewer.ts";

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
});
test.afterAll(() => viewer.stop());

test("an ignored file on disk comes back as an empty cut, never its contents", async () => {
  // the handler checks the file before reading it; without the check, this would read secret.txt from disk
  const res = await fetch(`${viewer.url}code?path=secret.txt&side=RIGHT&start=1&end=1`);
  expect(await res.json()).toEqual({ diff: "", moreAbove: false, moreBelow: false, hash: "", reviewed: false });
});

test("no other page can read its answers", async () => {
  // a request from another localhost page gets no permission to read the answer (cors is off)
  const res = await fetch(`${viewer.url}code?path=app.ts&side=RIGHT&start=1&end=1`, { headers: { Origin: "http://localhost:5173" } });
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
});
