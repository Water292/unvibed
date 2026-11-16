import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";

/** Runs git in repo, a folder in a repo or worktree. */
export const git = (repo: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });

/** Runs git in repo with input on stdin. */
export const gitWithInput = (repo: string, input: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28, input, stdio: ["pipe", "pipe", "ignore"] });

/** A file in repo as it is at a commit, or on disk when no commit is given; undefined if it doesn't exist there. */
export function show(repo: string, rev: string | undefined, path: string): string | undefined {
  try {
    if (rev) return git(repo, "show", `${rev}:${path}`);
    return readFileSync(`${git(repo, "rev-parse", "--show-toplevel").trim()}/${path}`, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Whether path, from the repo's top, names a file in repo: at a commit, a file in its tree; on disk (no
 * commit), a file git lists, tracked or untracked but not ignored, that isn't a symlink, which reading would
 * follow out of the repo. Anything else (outside the repo, ignored, in .git, a folder) is not.
 */
export function isRepoFile(repo: string, rev: string | undefined, path: string): boolean {
  try {
    if (rev) return git(repo, "cat-file", "-t", `${rev}:${path}`).trim() === "blob";
    const listed = git(repo, "ls-files", "-z", "--full-name", "--cached", "--others", "--exclude-standard", "--", `:(top,literal)${path}`);
    // exactly this one file: a folder would list the files in it
    return listed === `${path}\0` && !lstatSync(`${git(repo, "rev-parse", "--show-toplevel").trim()}/${path}`).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Where a PR's changes start in repo: the merge-base of origin/main and HEAD. */
export const defaultBase = (repo: string) => git(repo, "merge-base", "origin/main", "HEAD").trim();
