import type { Situation } from "../types";

interface Props {
  situations: Situation[];
  onDiscuss: (sit: Situation) => void;
  onResolve: (sit: Situation) => void;
}

function verdictPillStyle(verdict: string): React.CSSProperties {
  if (verdict === "deploy") return { background: "#0a2a1a", color: "#4ade80" };
  if (verdict === "partial_deploy") return { background: "#1a2a0a", color: "#a3e635" };
  if (verdict === "hold") return { background: "#3a2d0a", color: "#d97706" };
  return { background: "#2a2d34", color: "#9ca3af" };
}

export function OpenSituations({ situations, onDiscuss, onResolve }: Props) {
  const open = situations.filter((s) => s.status === "open");
  if (open.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid #4a9eff",
        borderRadius: 6,
        padding: 10,
        marginBottom: 14,
        background: "#0a1a2a",
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 8, color: "#4a9eff" }}>
        📌 Open Situations · {open.length}
      </div>
      {open.map((sit) => {
        const v = sit.verdict_history.at(-1);
        return (
          <div
            key={sit.id}
            style={{
              background: "#11151c",
              padding: 10,
              borderRadius: 4,
              marginBottom: 6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{sit.title}</strong>
                {sit.target_date && (
                  <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                    target {sit.target_date}
                  </span>
                )}
              </div>
              {v && (
                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: "bold",
                    ...verdictPillStyle(v.verdict),
                  }}
                >
                  {v.verdict.toUpperCase()}
                </span>
              )}
            </div>
            {v?.rationale && (
              <div style={{ color: "#aaa", marginTop: 4, fontSize: 11 }}>{v.rationale}</div>
            )}
            {v?.suggested_action && (
              <div style={{ color: "#bbb", marginTop: 4, fontSize: 11 }}>
                <em>{v.suggested_action}</em>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 10, color: "#888" }}>
              History: {sit.verdict_history.length} verdicts
              {v && ` · last run ${v.run_at.slice(0, 10)}`}
              {sit.related_findings.length > 0 && ` · related: ${sit.related_findings.join(", ")}`}
              {sit.portfolio_effects.length > 0 &&
                ` · adjusts portfolio: ${sit.portfolio_effects
                  .map((e) => (e.type === "mark_cash_pending" ? `$${e.amount_usd.toLocaleString()} cash pending` : `${e.ticker} pending`))
                  .join(", ")}`}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button onClick={() => onDiscuss(sit)} style={{ fontSize: 10, padding: "3px 8px" }}>
                Discuss in chat
              </button>
              <button onClick={() => onResolve(sit)} style={{ fontSize: 10, padding: "3px 8px" }}>
                Mark resolved
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
