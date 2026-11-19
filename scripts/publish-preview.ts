// Commits the build in dist/ as branch preview/pr-<number>, one commit with no
// parent, so it installs with
//
//   npm install github:Water292/unvibed#preview/pr-<number>
//
//   node scripts/publish-preview.ts [--pr <number>] [--push]
//
// The number is this branch's PR's, from gh, unless --pr gives it. The branch
// is made here; --push also force-pushes it to origin (each publish replaces
// the last, so it never fast-forwards). The checkout and its index are left
// as they are.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const usage = "usage: node scripts/publish-preview.ts [--pr <number>] [--push]";

/** Runs git here, with extra environment variables; returns what it prints, trimmed. */
const runGit = (args: string[], env: Record<string, string> = {}) =>
  execFileSync("git", args, { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] }).trim();

/** This branch's open PR's number, from gh. */
const currentPrNumber = () =>
  execFileSync("gh", ["pr", "view", "--json", "number", "--jq", ".number"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs({ args: argv, options: { pr: { type: "string" }, push: { type: "boolean" } } });
  } catch (e) {
    console.error(`${(e as Error).message}\n${usage}`);
    return 2;
  }
  const pr = args.values.pr ?? currentPrNumber();
  if (!/^\d+$/.test(pr)) {
    console.error(`${JSON.stringify(pr)} isn't a PR number\n${usage}`);
    return 2;
  }
  const dist = resolve(runGit(["rev-parse", "--show-toplevel"]), "dist");
  if (!existsSync(join(dist, "package.json"))) {
    console.error(`no build: ${dist}/package.json doesn't exist`);
    return 1;
  }

  // dist/'s files go in a tree through an index of their own, so the checkout's index isn't touched.
  const scratch = mkdtempSync(join(tmpdir(), "unvibed-preview-"));
  let tree: string;
  try {
    const env = { GIT_INDEX_FILE: join(scratch, "index"), GIT_WORK_TREE: dist };
    runGit(["add", "--all", "--force", "."], env);
    tree = runGit(["write-tree"], env);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const source = runGit(["rev-parse", "HEAD"]);
  const dirty = runGit(["status", "--porcelain"]) !== "";
  const message = `Build of PR #${pr} at ${source}${dirty ? ", with changes not committed" : ""}`;
  const commit = runGit(["commit-tree", tree, "-m", message]);
  const branch = `refs/heads/preview/pr-${pr}`;
  runGit(["update-ref", branch, commit]);
  console.log(`${branch} is ${commit}: ${message}`);

  if (args.values.push) {
    runGit(["push", "--force", "origin", `${branch}:${branch}`]);
    console.log(`pushed: npm install github:Water292/unvibed#preview/pr-${pr}`);
  } else {
    console.log("not pushed: run again with --push to push it");
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
