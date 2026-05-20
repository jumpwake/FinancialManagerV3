import { useState } from "react";
import type { Situation, AnalysisOutput } from "../types";
import { runPulseCheck } from "../ai/pulseCheck";
import { aiClient } from "../ai/client";

interface Props {
  situations: Situation[];
  analysis: AnalysisOutput;
  onDiscuss: (sit: Situation) => void;
  onResolve: (sit: Situation) => void;
  onDelete: (sit: Situation) => void;
}

function verdictPillStyle(verdict: string): React.CSSProperties {
  if (verdict === "deploy") return { background: "#0a2a1a", color: "#4ade80" };
  if (verdict === "partial_deploy") return { background: "#1a2a0a", color: "#a3e635" };
  if (verdict === "hold") return { background: "#3a2d0a", color: "#d97706" };
  return { background: "#2a2d34", color: "#9ca3af" };
}

const actionButtonStyle: React.CSSProperties = { fontSize: 10, padding: "3px 8px" };

export function OpenSituations({ situations, analysis, onDiscuss, onResolve, onDelete }: Props) {
  const open = situations.filter((s) => s.status === "open");
  const [pulsing, setPulsing] = useState<Set<string>>(new Set());

  if (open.length === 0) return null;

  async function refreshVerdict(sit: Situation) {
    if (pulsing.has(sit.id)) return;
    setPulsing(p => { const n = new Set(p); n.add(sit.id); return n; });
    try {
      const related_flags = (analysis.flags ?? []).filter(f =>
        sit.related_findings?.includes(f.finding_key));
      const verdict = await runPulseCheck(
        { situation: sit, macro: analysis.macro, portfolio: analysis.portfolio, related_flags },
        aiClient,
      );
      const next = [...(sit.verdict_history ?? []), verdict];
      await fetch(`/api/situations/${encodeURIComponent(sit.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict_history: next }),
      });
      // App.tsx's 5s situations poll will pick up the change.
    } finally {
      setPulsing(p => { const n = new Set(p); n.delete(sit.id); return n; });
    }
  }

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{sit.title}</strong>
                {sit.target_date && (
                  <span style={{ color: "#888", fontSize: 11, marginLeft: 6 }}>
                    target {sit.target_date}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                <button
                  type="button"
                  onClick={() => onDelete(sit)}
                  title="Delete situation"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "2px 6px",
                  }}
                >
                  ×
                </button>
              </div>
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
                  .map((e) =>
                    e.type === "mark_cash_pending"
                      ? e.amount_usd !== undefined
                        ? `$${e.amount_usd.toLocaleString()} cash pending`
                        : "all idle cash pending"
                      : `${e.ticker} pending`,
                  )
                  .join(", ")}`}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <button onClick={() => onDiscuss(sit)} style={actionButtonStyle}>
                Discuss in chat
              </button>
              <button onClick={() => onResolve(sit)} style={actionButtonStyle}>
                Mark resolved
              </button>
              <button
                type="button"
                disabled={pulsing.has(sit.id)}
                onClick={() => refreshVerdict(sit)}
                style={actionButtonStyle}
              >
                {pulsing.has(sit.id) ? "Checking…" : "Refresh verdict"}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
