# Writing a graph

A graph explains a change so a reviewer can follow it from the graph alone. `<unvibed>` below is a checkout of unvibed. The graph's format is `<unvibed>/shared/graph.ts`: read its comments first, they say what every field holds.

The change is `git diff <base> <head>`, in the repo the graph is for; whoever asks for the graph names the base and head. If you're also given a description of the change, use it for why the change was made, and check what it says against the code: where they differ, the code is what the graph describes.

## Rules

- **Write for a reviewer who hasn't seen the code.** Plain words about what the code does, with no shorthand or jargon. A title says what its code does, as a statement. Say only what the code or the description shows; a guess at why is marked as a guess.
- **Make what a reviewer should check stand out.** A changed behaviour, an edge case or a risk gets a sentence of its own, early in its node, not one buried mid-paragraph.
- **A node is one idea, reviewed as a unit.** A function, type, component or fix that does work of its own gets a node, together with what exists only for it: its imports, the dependency it brings in, a helper of a few lines, the state it keeps, the lines that pass its result along, the lines elsewhere a fix needs to work. Two things that each do work of their own are two nodes, even when one calls the other or they share a file. Don't split one idea into steps to keep nodes short, and don't join ideas to have fewer nodes.
- **Keep nodes short.** A node says what its code does and why, plus what to check, in as few words as that takes. Don't retell the code step by step: its locations show it. For tests, say what behaviour they pin down and what they leave out.
- **Show every changed line.** Every line the change adds or removes is shown by at least one location; a line may appear in more than one. Large generated files, such as a lockfile, may be left out. graph check lists every changed line no location shows; go through that list before calling the graph done.
- **Edges start from the node holding the referencing line.** An edge's `from` node must have a location containing the line that makes the edge true (the call, the import, the use), and it points the way things happen: caller → callee, never "called by". If no node holds that line, give the line a node of its own rather than hanging the edge off a parent.
- **Explain every name the change introduces.** A reader learns every new variable, field, function, state and back-and-forth with a library from the graph, without asking. Each is explained, saying what it holds and where it comes from, in the node for the idea it serves; a name gets a node of its own only when it is an idea of its own. Nodes link along the data flow. A cryptic name is renamed in the code, not explained around.
- **Removed lines only when nothing replaces them.** A RIGHT location already shows the lines it replaced at the same place in the same file, so a LEFT location is only for lines removed with nothing in their place, such as a deleted file, even when their code moved somewhere else.
- **Titles, edge notes and text are plain text**: no backticks or markdown.
- **Validated nodes change only mechanically.** When a graph grows for a later commit, nodes already accepted keep their text; only their line numbers, hashes and counts follow the code, and new nodes may link into them. Don't write facts that later commits will make stale.
- **Re-read the graph after each code change.** Whenever the code changes, update the graph, then re-read every node, location and edge text against the new code, even when the same edit was made before.

## Mechanics

- Leave the repo as you found it, apart from the graph file: delete anything you write to try the code out, and commit nothing unless asked.
- Every node, edge and location `id` is a fresh lowercase UUID (`node -e 'console.log(crypto.randomUUID())'`).
- `schema` is `git hash-object <unvibed>/shared/graph.ts`.
- Write each location with `"hash": ""`, `"added": 0`, `"removed": 0`, then run graph check from the repo the graph is for:

  ```sh
  node <unvibed>/src/cli.ts check <graph.json> --base <base> --head <head>
  ```

  For each location it reports, copy the printed `should be: hash …, added …, removed …` into the graph, and run it again until every location matches. It also lists the changed lines no location shows; that list never makes it fail.
- To look at the graph, from the repo the graph is for:

  ```sh
  node <unvibed>/src/view.ts <graph.json> --base <base> --head <head>
  ```
