import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";

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

/**
 * Whether path, from the repo's top, names a file in the repo: at a commit, a file in its tree; on disk (no
 * commit), a file git lists, tracked or untracked but not ignored, that isn't a symlink, which reading would
 * follow out of the repo. Anything else (outside the repo, ignored, in .git, a folder) is not.
 */
export function isRepoFile(rev: string | undefined, path: string): boolean {
  try {
    if (rev) return git("cat-file", "-t", `${rev}:${path}`).trim() === "blob";
    const listed = git("ls-files", "-z", "--full-name", "--cached", "--others", "--exclude-standard", "--", `:(top,literal)${path}`);
    // exactly this one file: a folder would list the files in it
    return listed === `${path}\0` && !lstatSync(`${git("rev-parse", "--show-toplevel").trim()}/${path}`).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Where a PR's changes start: the merge-base of origin/main and HEAD. */
export const defaultBase = () => git("merge-base", "origin/main", "HEAD").trim();
