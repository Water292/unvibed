// An AI reviewer's risk for each location, and so for each node, whose risk
// is its riskiest location's: a coloured line along the bottom of a node's box
// on the canvas, of each location's box in the side panel, and under the
// node's explanation, with the reviewer's reason, which can be asked about.
import type { ReactNode } from "react";
import type { Location, Risk } from "../../shared/graph.ts";
import { useHost } from "./host.tsx";

const COLOR: Record<Risk["level"], string> = { low: "#16a34a", medium: "#d97706", high: "#dc2626" };
const LABEL: Record<Risk["level"], string> = { low: "Low risk", medium: "Medium risk", high: "High risk" };
const RANK: Record<Risk["level"], number> = { low: 0, medium: 1, high: 2 };

/** A node's risk: its riskiest rated location (the first, on a tie); undefined if none is rated. */
export function riskiest(code: Location[]): { risk: Risk; location: Location } | undefined {
  let top: { risk: Risk; location: Location } | undefined;
  for (const location of code) if (location.risk && (!top || RANK[location.risk.level] > RANK[top.risk.level])) top = { risk: location.risk, location };
  return top;
}

export const where = (l: Location) => `${l.path}:${l.start_line ?? l.line}${l.start_line && l.start_line !== l.line ? `-${l.line}` : ""}`;

type Props = {
  risk: Risk | undefined;
  /** In the panel: the reason, and what it's about, shown; on the canvas, the level alone. */
  detailed?: boolean;
  /** Says what the risk is of, before its reason. */
  of?: ReactNode;
  /** Where a chat about this risk starts, and what it's told about it; unset where text can't be asked about. */
  ask?: { anchor: string; context: string };
};

/** The line at the bottom of a box; nothing if no reviewer rated it. */
export function RiskLine({ risk, detailed, of, ask }: Props) {
  const { Askable } = useHost();
  if (!risk) return null;
  const color = COLOR[risk.level];
  const line = (
    <div
      data-testid="risk"
      data-level={risk.level}
      title={risk.reason ? `AI reviewer: ${risk.reason}` : "AI reviewer"}
      style={{
        display: "flex",
        gap: 6,
        alignItems: detailed ? "flex-start" : "center",
        marginTop: 6,
        paddingTop: 4,
        borderTop: `2px solid ${color}`,
        fontSize: detailed ? 12 : 10.5,
        lineHeight: 1.35,
        fontFamily: "system-ui",
      }}
    >
      <span style={{ color, fontWeight: 700, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.4 }}>● {LABEL[risk.level]}</span>
      {detailed && (
        <span style={{ opacity: 0.85 }}>
          {of && <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, opacity: 0.75 }}>{of} </span>}
          {risk.reason}
        </span>
      )}
      {!detailed && <span style={{ opacity: 0.45, marginLeft: "auto" }}>AI reviewer</span>}
    </div>
  );
  return ask ? (
    <Askable anchor={ask.anchor} context={ask.context}>
      {line}
    </Askable>
  ) : (
    line
  );
}
