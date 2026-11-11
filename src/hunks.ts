// A file's locations' code, as small unified diffs, one per code box in the
// viewer's side panel, in the plain format any diff renderer reads, and each
// location's own rows, which a graph stores the hash of and marks are made
// by. Runs in Node (view.ts, check.ts).
import { createHash } from "node:crypto";
import gitdiffModule, { type Change } from "gitdiff-parser";
import { git, gitWithInput, show } from "./git.ts";
import { isReviewed } from "./review.ts";
import type { At, CodeAnswer, CodeBox, Own } from "../shared/graph-and-code.ts";
import type { Location } from "../shared/graph.ts";

/**
 * The parser. gitdiff-parser is CommonJS and its types say `export default`, so TypeScript expects the
 * parser one level down, under `.default`; Node gives an ES module the parser itself, so it's typed that way here.
 */
export const gitdiff = gitdiffModule as unknown as typeof gitdiffModule.default;

/** git's blob hash of the lines joined with "\n" (same as `git hash-object`). */
export function hashLines(lines: string[]): string {
  const content = Buffer.from(lines.join("\n"), "utf8");
  return createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
}

export function splitLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

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
 * Where in changes a location's line range is, counted on its side, as the first and last index (undefined when
 * nothing is in range): its changes, with up to CONTEXT unchanged lines before and after. Lines only on the other side are
 * kept where they sit next to lines in range, so a head range shows what it
 * replaced and a base range shows what replaced it.
 * above / below widen the range by that many lines; a widened edge that lands
 * inside a change goes on to the end of the change before the unchanged lines.
 */
export function hunkRange(changes: Change[], side: Location["side"], start: number, end: number, above = 0, below = 0): [number, number] | undefined {
  // a change's line number on the location's side; -1 if the line isn't on that side
  const line = side === "LEFT" ? oldLine : newLine;
  start -= above;
  end += below;
  let first = changes.findIndex((c) => line(c) >= start);
  if (first < 0) first = changes.length;
  // a diff lists what was replaced just before its replacement
  while (first > 0 && line(changes[first - 1]!) < 0) first--;
  let last = first - 1;
  while (last + 1 < changes.length && line(changes[last + 1]!) <= end) last++;
  // drop other-side lines trailing after the last line in range
  while (last >= first && line(changes[last]!) < 0) last--;
  if (last < first) return undefined;
  // a widened edge never cuts a change in half
  if (above) while (first > 0 && changes[first - 1]!.type !== "normal") first--;
  if (below) while (last + 1 < changes.length && changes[last + 1]!.type !== "normal") last++;
  // unchanged lines around them; a renderer lines up the two sides from these
  for (let n = 0; n < CONTEXT && first > 0 && changes[first - 1]!.type === "normal"; n++) first--;
  for (let n = 0; n < CONTEXT && last + 1 < changes.length && changes[last + 1]!.type === "normal"; n++) last++;
  return [first, last];
}

/** The changes hunkRange finds. */
export function hunkIn(changes: Change[], side: Location["side"], start: number, end: number, above = 0, below = 0): Change[] {
  const range = hunkRange(changes, side, start, end, above, below);
  return range ? changes.slice(range[0], range[1] + 1) : [];
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
 * A location's own rows, as unified diff lines: its lines, removed lines included, and not the unchanged lines around
 * them, any line numbers, or lines it was widened by. The same lines, changed the same way, keep their hash, and so
 * their mark, wherever they move.
 */
export function ownRows(changes: Change[], side: Location["side"], start: number, end: number): string[] {
  const line = side === "LEFT" ? oldLine : newLine;
  return hunkIn(changes, side, start, end)
    .filter((c) => c.type !== "normal" || (line(c) >= start && line(c) <= end))
    .map(toDiffLine);
}

/** What /code answers for n locations in a file that can't be read on their side: one empty box. */
export function emptyAnswer(n: number): CodeAnswer {
  const items = Array.from({ length: n }, (_, i) => i);
  return { boxes: [{ items, diff: "", from: 0, to: 0, moreAbove: false, moreBelow: false }], own: items.map(() => ({ hash: "", reviewed: false })) };
}

/**
 * The locations ats of path on side, each widened by its above / below lines, read now (from git at a commit, from
 * disk for the working tree), as code boxes (boxesIn), and each location's own rows' hash and whether it's marked
 * reviewed in review, from the same read. The caller
 * checks that path is a file in the repo (isRepoFile).
 */
export function codeFor(path: string, side: Location["side"], ats: At[], base: string, head: string | undefined, review: string): CodeAnswer {
  const before = show(base, path);
  const after = show(head, path);
  if ((side === "LEFT" ? before : after) === undefined) return emptyAnswer(ats.length);
  const changes = getChanges(before, after);
  const own = ats.map(({ start, end }): Own => {
    const rows = ownRows(changes, side, start, end);
    const hash = rows.length ? hashLines(rows) : "";
    return { hash, reviewed: isReviewed(review, hash) };
  });
  return { boxes: boxesIn(path, changes, side, ats), own };
}

/**
 * The code boxes for locations ats of path on side, in the order they start: each location's rows (hunkRange), with
 * locations whose rows overlap or touch, so that no row is hidden between them, run into one box. A location with no
 * rows in range is a box of its own, last, with no lines.
 */
export function boxesIn(path: string, changes: Change[], side: Location["side"], ats: At[]): CodeBox[] {
  const line = side === "LEFT" ? oldLine : newLine;
  const cuts = ats
    .map(({ start, end, above, below }, i) => ({ i, range: hunkRange(changes, side, start, end, above, below) }))
    .sort((a, b) => (a.range?.[0] ?? Infinity) - (b.range?.[0] ?? Infinity) || a.i - b.i);
  const runs: { items: number[]; range: [number, number] | undefined }[] = [];
  for (const { i, range } of cuts) {
    const run = runs.at(-1);
    if (range && run?.range && range[0] <= run.range[1] + 1) {
      run.items.push(i);
      run.range[1] = Math.max(run.range[1], range[1]);
    } else runs.push({ items: [i], range });
  }
  return runs.map(({ items, range }): CodeBox => {
    if (!range) return { items, diff: "", from: 0, to: 0, moreAbove: false, moreBelow: false };
    const cut = changes.slice(range[0], range[1] + 1);
    const lines = cut.map(line).filter((n) => n > 0);
    return {
      items,
      diff: diffText(path, cut),
      from: lines[0] ?? 0,
      to: lines.at(-1) ?? 0,
      moreAbove: range[0] > 0,
      moreBelow: range[1] < changes.length - 1,
    };
  });
}
