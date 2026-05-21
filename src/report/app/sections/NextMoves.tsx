import { AnalysisOutput, TacticalMove } from "../types";
import { COLORS } from "../theme";
import { useIsMobile } from "../hooks/useIsMobile";

const CATEGORY_COLOR: Record<TacticalMove["category"], string> = {
  deploy_cash: COLORS.amber,
  rebalance: COLORS.accentBlue,
  trim: "#888",
  asset_location_swap: COLORS.green,
  scenario_hedge: "#9b6dff",
  tax_loss_harvest: "#3ec8c3",
};

interface Props {
  data: AnalysisOutput;
  inflightMoves?: Set<string>;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: TacticalMove) => void;
}

export default function NextMoves({ data, inflightMoves, onDiscussMove, onTrackMove }: Props) {
  const ta = data.tactical_advisor;
  if (!ta) {
    return (
      <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
        (Tactical recommendations are AI-generated — set ANTHROPIC_API_KEY and re-run.)
      </div>
    );
  }
  const { tactical_plan } = ta;

  return (
    <div>
      <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.6, marginBottom: 12 }}>
        {tactical_plan.summary}
      </div>
      <div style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 20 }}>
        Current grade: <strong style={{ color: COLORS.text }}>{data.portfolio_grade}</strong>{" "}
        → Target: <strong style={{ color: COLORS.green }}>{tactical_plan.target_grade}</strong>
      </div>

      <MoveList
        title={`Next 7 days  (${tactical_plan.next_7_days.length} moves)`}
        moves={tactical_plan.next_7_days}
        inflightMoves={inflightMoves}
        onDiscussMove={onDiscussMove}
        onTrackMove={onTrackMove}
      />
      <MoveList
        title={`Next 30 days  (${tactical_plan.next_30_days.length} moves)`}
        moves={tactical_plan.next_30_days}
        inflightMoves={inflightMoves}
        onDiscussMove={onDiscussMove}
        onTrackMove={onTrackMove}
      />

      {tactical_plan.scenario_resilience_notes.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Scenario resilience
          </div>
          <ul style={{ paddingLeft: 18, color: COLORS.text, fontSize: 13, lineHeight: 1.7 }}>
            {tactical_plan.scenario_resilience_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function MoveList({ title, moves, inflightMoves, onDiscussMove, onTrackMove }: {
  title: string;
  moves: TacticalMove[];
  inflightMoves?: Set<string>;
  onDiscussMove?: (id: string) => void;
  onTrackMove?: (m: TacticalMove) => void;
}) {
  const isMobile = useIsMobile();
  if (moves.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: COLORS.textMuted, marginBottom: 8 }}>
        {title}
      </div>
      {moves.map(m => {
        const isInflight = inflightMoves?.has(m.id) ?? false;
        return (
        <div key={m.id} style={{ marginBottom: 10, padding: "10px 12px", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderLeft: `4px solid ${CATEGORY_COLOR[m.category]}`, borderRadius: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 6px",
              borderRadius: 3, background: CATEGORY_COLOR[m.category], color: "#fff",
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>{m.category.replace(/_/g, " ")}</span>
            <span style={{ fontSize: 13, color: COLORS.text }}>{m.action}</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5, marginBottom: 6 }}>
            {m.rationale}
          </div>
          {m.scenarios_addressed.length > 0 && (
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
              Addresses: {m.scenarios_addressed.join(", ")}
            </div>
          )}
          <div
            style={{
              display: isMobile ? "grid" : "flex",
              gridTemplateColumns: isMobile ? "1fr" : undefined,
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => onDiscussMove?.(m.id)}
              style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11, width: isMobile ? "100%" : undefined }}
            >
              💬 Discuss
            </button>
            <button
              type="button"
              onClick={() => onTrackMove?.(m)}
              disabled={isInflight}
              style={{ background: "transparent", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, padding: "2px 6px", borderRadius: 4, cursor: isInflight ? "not-allowed" : "pointer", fontSize: 11, opacity: isInflight ? 0.5 : 1, width: isMobile ? "100%" : undefined }}
            >
              {isInflight ? "Adding…" : "+ Situation"}
            </button>
          </div>
        </div>
      );})}
    </div>
  );
}
