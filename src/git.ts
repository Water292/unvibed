import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });

/** Runs git with input on stdin. */
export const gitWithInput = (input: string, ...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, input, stdio: ["pipe", "pipe", "ignore"] });

/** A file as it is at a commit, or on disk when no commit is given; undefined if it doesn't exist there. */
export function show(rev: string | undefined, path: string): string | undefined {
  try {
    if (rev) return git("show", `${rev}:${path}`);
    return readFileSync(`${git("rev-parse", "--show-toplevel").trim()}/${path}`, "utf8");
  } catch {
    return undefined;
  }
}

/** Where a PR's changes start: the merge-base of origin/main and HEAD. */
export const defaultBase = () => git("merge-base", "origin/main", "HEAD").trim();
