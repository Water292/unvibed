// The code each node points at, as diff hunks in react-diff-view's own format,
// for the viewer's side panel. Runs in Node (view.ts); the page only gets
// these hunks, never whole files.
import { computeNewLineNumber, computeOldLineNumber, parseDiff, type ChangeData, type HunkData } from "react-diff-view";
import { git, show } from "./git.ts";
import type { GraphAndCode } from "../shared/graph-and-code.ts";
import type { Graph, Location } from "../shared/graph.ts";

/**
 * Every line of a file between base and head (undefined = the working tree),
 * as changes; undefined if the file can't be read on the given side. git
 * diffs the whole file, so nothing is left out. When git shows no
 * difference, the file is either unchanged or new and not yet tracked. zip
 * pairs removed lines with the added lines replacing them, first with first,
 * for a split view; git's order (all removed, then all added) suits unified.
 */
function fileChanges(path: string, side: Location["side"], base: string, head: string | undefined, zip: boolean): ChangeData[] | undefined {
  const before = show(base, path);
  const mine = side === "LEFT" ? before : show(head, path);
  if (mine === undefined) return undefined;
  const diff = git("diff", "--unified=100000", base, ...(head ? [head] : []), "--", path);
  if (diff) return parseDiff(diff, zip ? { nearbySequences: "zip" } : {})[0]?.hunks.flatMap((h) => h.changes) ?? [];
  const lines = mine.replace(/\n$/, "").split("\n");
  if (before === undefined)
    return lines.map((content, i): ChangeData => ({ type: "insert", isInsert: true, lineNumber: i + 1, content }));
  return lines.map((content, i): ChangeData => ({ type: "normal", isNormal: true, oldLineNumber: i + 1, newLineNumber: i + 1, content }));
}

/**
 * The changes in a location's line range, counted on its side, as one hunk.
 * Lines only on the other side are kept where they sit next to lines in
 * range, so a head range shows what it replaced and a base range shows what
 * replaced it.
 */
export function hunkIn(changes: ChangeData[], side: Location["side"], start: number, end: number): HunkData {
  // a change's line number on the location's side; -1 if the line isn't on that side
  const line = side === "LEFT" ? computeOldLineNumber : computeNewLineNumber;
  let first = changes.findIndex((c) => line(c) >= start);
  if (first < 0) first = changes.length;
  // a diff lists what was replaced just before its replacement
  while (first > 0 && line(changes[first - 1]!) < 0) first--;
  const picked: ChangeData[] = [];
  for (const c of changes.slice(first)) {
    if (line(c) > end) break;
    picked.push(c);
  }
  // drop other-side lines trailing after the last line in range
  while (picked.length && line(picked.at(-1)!) < 0) picked.pop();

  const olds = picked.map(computeOldLineNumber).filter((n) => n > 0);
  const news = picked.map(computeNewLineNumber).filter((n) => n > 0);
  const [oldStart, newStart] = [olds[0] ?? 0, news[0] ?? 0];
  return {
    content: `@@ -${oldStart},${olds.length} +${newStart},${news.length} @@`,
    oldStart,
    newStart,
    oldLines: olds.length,
    newLines: news.length,
    changes: picked,
  };
}

/** Every node's hunks, zipped for a split view if asked. A hunk with no changes means the file can't be read on the location's side. Each file's changes are worked out once per side. */
export function codeFor(graph: Graph, base: string, head: string | undefined, zip: boolean): GraphAndCode {
  const files = new Map<string, ChangeData[] | undefined>();
  const hunk = (loc: Location) => {
    const key = `${loc.side}:${loc.path}`;
    if (!files.has(key)) files.set(key, fileChanges(loc.path, loc.side, base, head, zip));
    return hunkIn(files.get(key) ?? [], loc.side, loc.start_line ?? loc.line, loc.line);
  };
  return { graph, perNodeHunks: Object.fromEntries(graph.nodes.map((n) => [n.id, n.code.map(hunk)])) };
}
