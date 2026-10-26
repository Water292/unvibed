// The code each node points at, as one small unified diff per location, for
// the viewer's side panel, in the plain format any diff renderer reads, plus
// the files those locations point into, whole, which the renderer draws lines
// from. Runs in Node (view.ts).
import gitdiffModule, { type Change } from "gitdiff-parser";
import { git, show } from "./git.ts";
import type { FileContents, GraphAndCode } from "../shared/graph-and-code.ts";
import type { Graph, Location } from "../shared/graph.ts";

/**
 * The parser. gitdiff-parser is CommonJS and its types say `export default`, so TypeScript expects the
 * parser one level down, under `.default`; Node gives an ES module the parser itself, so it's typed that way here.
 */
export const gitdiff = gitdiffModule as unknown as typeof gitdiffModule.default;

/** A line's number on the old or the new side; -1 when the line isn't on that side. */
const oldLine = (c: Change) => (c.type === "normal" ? c.oldLineNumber : c.type === "delete" ? c.lineNumber : -1);
const newLine = (c: Change) => (c.type === "normal" ? c.newLineNumber : c.type === "insert" ? c.lineNumber : -1);

/**
 * Every line of a file between base and head (undefined = the working tree),
 * as changes; undefined if the file can't be read on the given side. git
 * diffs the whole file, so nothing is left out. When git shows no
 * difference, the file is either unchanged or new and not yet tracked.
 */
function fileChanges(path: string, side: Location["side"], base: string, head: string | undefined, file: FileContents): Change[] | undefined {
  const mine = side === "LEFT" ? file.old : file.new;
  if (mine === undefined) return undefined;
  const diff = git("diff", "--unified=100000", base, ...(head ? [head] : []), "--", path);
  if (diff) return gitdiff.parse(diff)[0]?.hunks.flatMap((h) => h.changes) ?? [];
  const lines = mine.replace(/\n$/, "").split("\n");
  if (file.old === undefined)
    return lines.map((content, i): Change => ({ type: "insert", isInsert: true, lineNumber: i + 1, content }));
  return lines.map((content, i): Change => ({ type: "normal", isNormal: true, oldLineNumber: i + 1, newLineNumber: i + 1, content }));
}

/** Unchanged lines kept around a location's lines, as git keeps around a change. */
export const CONTEXT = 3;

/**
 * The changes in a location's line range, counted on its side, with up to
 * CONTEXT unchanged lines before and after. Lines only on the other side are
 * kept where they sit next to lines in range, so a head range shows what it
 * replaced and a base range shows what replaced it.
 */
export function hunkIn(changes: Change[], side: Location["side"], start: number, end: number): Change[] {
  // a change's line number on the location's side; -1 if the line isn't on that side
  const line = side === "LEFT" ? oldLine : newLine;
  let first = changes.findIndex((c) => line(c) >= start);
  if (first < 0) first = changes.length;
  // a diff lists what was replaced just before its replacement
  while (first > 0 && line(changes[first - 1]!) < 0) first--;
  let last = first - 1;
  while (last + 1 < changes.length && line(changes[last + 1]!) <= end) last++;
  // drop other-side lines trailing after the last line in range
  while (last >= first && line(changes[last]!) < 0) last--;
  if (last < first) return [];
  // unchanged lines around them; a renderer lines up the two sides from these
  for (let n = 0; n < CONTEXT && first > 0 && changes[first - 1]!.type === "normal"; n++) first--;
  for (let n = 0; n < CONTEXT && last + 1 < changes.length && changes[last + 1]!.type === "normal"; n++) last++;
  return changes.slice(first, last + 1);
}

/**
 * Changes as unified diff text for path: header lines, one @@ line giving
 * where they start on each side and how many lines each side has, then each
 * line marked +, - or space. Empty when there are no changes.
 */
export function diffText(path: string, changes: Change[]): string {
  if (!changes.length) return "";
  const olds = changes.map(oldLine).filter((n) => n > 0);
  const news = changes.map(newLine).filter((n) => n > 0);
  const lines = changes.map((c) => (c.type === "insert" ? "+" : c.type === "delete" ? "-" : " ") + c.content);
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${olds[0] ?? 0},${olds.length} +${news[0] ?? 0},${news.length} @@`,
    ...lines,
  ].join("\n");
}

/**
 * Every node's code, one diff per location, and each file they point into, whole. An empty diff means the file
 * can't be read on the location's side. Each file is read once, and its changes worked out once per side.
 */
export function codeFor(graph: Graph, base: string, head: string | undefined): GraphAndCode {
  const files: Record<string, FileContents> = {};
  const changes = new Map<string, Change[] | undefined>();
  const diff = (loc: Location) => {
    const file = (files[loc.path] ??= { old: show(base, loc.path), new: show(head, loc.path) });
    const key = `${loc.side}:${loc.path}`;
    if (!changes.has(key)) changes.set(key, fileChanges(loc.path, loc.side, base, head, file));
    return diffText(loc.path, hunkIn(changes.get(key) ?? [], loc.side, loc.start_line ?? loc.line, loc.line));
  };
  return { graph, perNodeDiffs: Object.fromEntries(graph.nodes.map((n) => [n.id, n.code.map(diff)])), files };
}
