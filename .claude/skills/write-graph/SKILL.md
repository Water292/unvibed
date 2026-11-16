---
name: write-graph
description: Write or update an unvibed understanding graph (a graph.json of nodes, edges and code locations that explains a change) for a branch or PR in this repo. Use when asked for a change's graph, and whenever code on a branch that has a graph changes.
---

# Writing a graph in this repo

How to write a graph is in `docs/writing-graphs.md`: read it and follow it. In this repo:

- `<unvibed>` is this repo, and the commands are its mise tasks: `mise run graph check <graph.json> --base <base> --head <head>` and `mise run view <graph.json> --base <base> --head <head>`.
- Unless told otherwise, base is `git merge-base origin/main HEAD` and head is the working tree.
- **Show the graph in the viewer before pushing.**
- **Run graph check before attaching a graph to a PR**, and attach it only when every location matches.
