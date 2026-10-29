// The code each node points at, as one small unified diff per location, for
// the viewer's side panel, in the plain format any diff renderer reads, plus
// the files those locations point into, whole, which the renderer draws lines
// from. Runs in Node (view.ts).
import gitdiffModule, { type Change } from "gitdiff-parser";
import { hashLines, splitLines } from "./check.ts";
import { git, gitWithInput, show } from "./git.ts";
import type { FileContents, LocationView } from "../shared/graph-and-code.ts";
import type { Location } from "../shared/graph.ts";

/**
 * The parser. gitdiff-parser is CommonJS and its types say `export default`, so TypeScript expects the
 * parser one level down, under `.default`; Node gives an ES module the parser itself, so it's typed that way here.
 */
export const gitdiff = gitdiffModule as unknown as typeof gitdiffModule.default;

/** A line's number on the old or the new side; -1 when the line isn't on that side. */
const oldLine = (c: Change) => (c.type === "normal" ? c.oldLineNumber : c.type === "delete" ? c.lineNumber : -1);
const newLine = (c: Change) => (c.type === "normal" ? c.newLineNumber : c.type === "insert" ? c.lineNumber : -1);

/** A change as a unified diff line: marked +, - or space. */
const toDiffLine = (c: Change) => (c.type === "insert" ? "+" : c.type === "delete" ? "-" : " ") + c.content;

/**
 * Every line between two texts of a file (undefined = the file isn't there), as changes; unchanged lines carry their
 * number in both. git diffs the texts themselves, stored as blobs, so the diff is of exactly what was read.
 */
export function getChanges(before: string | undefined, after: string | undefined): Change[] {
  if (before === after)
    return splitLines(before ?? "").map((content, i): Change => ({ type: "normal", isNormal: true, oldLineNumber: i + 1, newLineNumber: i + 1, content }));
  const blob = (text: string | undefined) => gitWithInput(text ?? "", "hash-object", "-w", "--stdin").trim();
  const diff = git("diff", "--unified=100000", blob(before), blob(after));
  return gitdiff.parse(diff)[0]?.hunks.flatMap((h) => h.changes) ?? [];
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
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${olds[0] ?? 0},${olds.length} +${news[0] ?? 0},${news.length} @@`,
    ...changes.map(toDiffLine),
  ].join("\n") + "\n"; // every line ends in a newline, the last one too, as in git's own diffs
}

/**
 * What the page shows of each location: createLocationView gives its diff (empty if the file isn't there on its side)
 * and the hash a mark is made by (empty if there's nothing in its range); files has every file read, whole. Each file
 * is read once, and every location's diff and hash come from that one read.
 */
export function codeFor(base: string, head: string | undefined) {
  const files: Record<string, FileContents> = {};
  const changes = new Map<string, Change[]>();
  const read = (path: string) => (files[path] ??= { old: show(base, path), new: show(head, path) });
  const createLocationView = (location: Location): LocationView => {
    const file = read(location.path);
    if ((location.side === "LEFT" ? file.old : file.new) === undefined) return { location, diff: "", hash: "" };
    if (!changes.has(location.path)) changes.set(location.path, getChanges(file.old, file.new));
    const start = location.start_line ?? location.line;
    const hunk = hunkIn(changes.get(location.path)!, location.side, start, location.line);
    // The hash covers the location's own rows, removed lines included, and not the unchanged lines around them or any
    // line numbers: the same lines, changed the same way, keep their mark wherever they move.
    const line = location.side === "LEFT" ? oldLine : newLine;
    const own = hunk.filter((c) => c.type !== "normal" || (line(c) >= start && line(c) <= location.line));
    return { location, diff: diffText(location.path, hunk), hash: own.length ? hashLines(own.map(toDiffLine)) : "" };
  };
  return { createLocationView, files };
}
