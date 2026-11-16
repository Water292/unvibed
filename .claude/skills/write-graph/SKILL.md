---
name: write-graph
description: Write or update an unvibed understanding graph (a graph.json of nodes, edges and code locations that explains a change) for a branch or PR. Use when asked for a change's graph, and whenever code on a branch that has a graph changes.
---

# Writing a graph

A graph explains a change so a reviewer can follow it from the graph alone. Its format is `shared/graph.ts`: read its comments first, they say what every field holds.

The change is `git diff <base> <head>`. Unless told otherwise, base is `git merge-base origin/main HEAD` and head is the working tree.

## Rules

- **Show every changed line.** Every line the change adds or removes is shown by at least one location; a line may appear in more than one. Large generated files, such as a lockfile, may be left out. graph check lists every changed line no location shows; go through that list before calling the graph done.
- **Edges start from the node holding the referencing line.** An edge's `from` node must have a location containing the line that makes the edge true (the call, the import, the use), and it points the way things happen: caller → callee, never "called by". If no node holds that line, give the line a node of its own rather than hanging the edge off a parent.
- **Explain every name the change introduces.** A reader learns every new variable, field, function, state and back-and-forth with a library from the graph, without asking. A name that carries meaning gets its own node saying what it holds and where it comes from; nodes link along the data flow. A cryptic name is renamed in the code, not explained around.
- **Removed lines only when nothing replaces them.** A RIGHT location already shows the lines it replaced, so a LEFT location is only for a pure deletion.
- **Titles, edge notes and text are plain text**: no backticks or markdown.
- **Validated nodes change only mechanically.** When a graph grows for a later commit, nodes already accepted keep their text; only their line numbers, hashes and counts follow the code, and new nodes may link into them. Don't write facts that later commits will make stale.
- **Re-read the graph after each code change.** Whenever the code changes, update the graph, then re-read every node, location and edge text against the new code, even when the same edit was made before.
- **Run graph check before attaching**, and attach only when it passes.
- **Show the graph in the viewer before pushing.**

## Mechanics

- Every node, edge and location `id` is a fresh lowercase UUID (`node -e 'console.log(crypto.randomUUID())'`).
- `schema` is `git hash-object shared/graph.ts`.
- Write each location with `"hash": ""`, `"added": 0`, `"removed": 0`, then run

  ```sh
  mise run graph check <graph.json> --base <base> --head <head>
  ```

  For each location it reports, copy the printed `should be: hash …, added …, removed …` into the graph, and run it again until it prints `ok`.
- Open it for review with

  ```sh
  mise run view <graph.json> --base <base> --head <head>
  ```
