/** An understanding graph of the code a PR touches, as it stands at the PR's head. */
export type Graph = {
  /** Array order is reading order. */
  nodes: Node[];
  edges: Edge[];
};

export type Node = {
  /** Unique within this graph. */
  id: string;
  /** What is true about this code. */
  text: string;
  code: Location[];
};

/** `to` helps explain `from`. */
export type Edge = {
  from: string;
  to: string;
  note?: string;
};

/** GitHub's PR review-comment location; field names unchanged. */
export type Location = {
  path: string;
  /** LEFT = base (deleted code), RIGHT = head. */
  side: "LEFT" | "RIGHT";
  /** First line; omit for a single line. */
  start_line?: number;
  /** Last line. */
  line: number;
};
