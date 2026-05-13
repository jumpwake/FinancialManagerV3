import { useState } from "react";
import { AnalysisOutput } from "../types";
import { COLORS } from "../theme";

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return COLORS.green;
  if (grade.startsWith("B")) return COLORS.accentBlue;
  if (grade.startsWith("C")) return COLORS.amber;
  return COLORS.red;
}

const REFERENCE_DETAILS: Record<string, { composition: string; philosophy: string }> = {
  boglehead_3fund: {
    composition:
      "~60% US Total Stock Market (VTI or FSKAX) · ~20% International Total Stock (VXUS or FTIHX) · ~20% US Total Bond Market (BND or FXNAX).",
    philosophy:
      "Pure passive indexing in three funds. Lowest cost, simplest to maintain, full diversification through cap-weighted market exposure. No tactical tilts. Most robust to behavioral mistakes — there's almost nothing to fiddle with.",
  },
  all_weather: {
    composition:
      "30% Stocks (US + international equity) · 40% Long-Term Treasuries (TLT or similar) · 15% Intermediate Treasuries · 7.5% Gold (GLD or IAU) · 7.5% Commodities (DJP or PDBC).",
    philosophy:
      "Ray Dalio / Bridgewater risk-parity allocation. Designed to perform across all four economic environments — rising/falling growth × rising/falling inflation — by sizing positions to equalize their volatility contribution rather than their dollar weight. Heavy bonds and explicit inflation hedges (gold + commodities) are the defining features.",
  },
  classic_60_40: {
    composition:
      "60% Stocks (typically US Total Market or S&P 500) · 40% Bonds (typically US Aggregate Bond Index — Bloomberg US Agg).",
    philosophy:
      "The traditional balanced portfolio. Equity drives growth, bonds dampen drawdowns and provide income. Long history of decent risk-adjusted returns. Vulnerable when stocks and bonds correlate (e.g., 2022's inflation shock) — but otherwise the default benchmark most financial-advisor portfolios are measured against.",
  },
};

export default function BenchmarkComparison({ data }: { data: AnalysisOutput }) {
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const portfolioCard = {
    id: "portfolio",
    label: data.portfolio.account_label,
    description: "Your portfolio",
    grade: data.portfolio_grade,
    score: data.portfolio_score,
    isPortfolio: true,
  };

  const refCards = data.reference_models.map(m => ({
    id: m.id,
    label: m.label,
    description: m.description,
    grade: m.grade,
    score: m.score,
    isPortfolio: false,
  }));

  const cards = [portfolioCard, ...refCards];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {cards.map(card => {
          const details = REFERENCE_DETAILS[card.id];
          return (
          <div
            key={card.id}
            style={{
              flex: 1,
              minWidth: 160,
              background: COLORS.card,
              border: card.isPortfolio
                ? `2px solid ${COLORS.accentBlue}`
                : `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "16px",
              textAlign: "center",
              position: "relative",
            }}
          >
            {details && (
              <button
                type="button"
                onClick={() => setOpenInfo(openInfo === card.id ? null : card.id)}
                title={`What's in ${card.label}?`}
                aria-label={`Details about ${card.label}`}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `1px solid ${COLORS.border}`,
                  background: "transparent",
                  color: COLORS.textMuted,
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                i
              </button>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
              {card.label}
            </div>
            <div style={{
              display: "inline-block",
              fontSize: 10,
              color: COLORS.textMuted,
              background: "#222",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 3,
              padding: "2px 6px",
              marginBottom: 14,
            }}>
              {card.description}
            </div>
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              color: gradeColor(card.grade),
              lineHeight: 1,
              marginBottom: 6,
              letterSpacing: "-0.02em",
            }}>
              {card.grade}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted }}>
              {card.score.toFixed(1)} / 10
            </div>
          </div>
        );})}
      </div>

      {openInfo && REFERENCE_DETAILS[openInfo] && (
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.accentBlue}`,
          borderRadius: 6,
          padding: "14px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: COLORS.text,
          lineHeight: 1.6,
          position: "relative",
        }}>
          <button
            type="button"
            onClick={() => setOpenInfo(null)}
            aria-label="Close details"
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              background: "transparent",
              border: "none",
              color: COLORS.textMuted,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ×
          </button>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accentBlue, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {data.reference_models.find(m => m.id === openInfo)?.label} — composition
          </div>
          <div style={{ marginBottom: 10 }}>
            {REFERENCE_DETAILS[openInfo].composition}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.accentBlue, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Philosophy
          </div>
          <div style={{ color: "#bbb" }}>
            {REFERENCE_DETAILS[openInfo].philosophy}
          </div>
        </div>
      )}

      {/* AI benchmark context */}
      {data.narratives ? (
        <div style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 6,
          padding: "14px 16px",
          fontSize: 14,
          color: "#bbb",
          lineHeight: 1.7,
        }}>
          {data.narratives.benchmark_context}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: "italic" }}>
          (AI narratives not generated — set ANTHROPIC_API_KEY and re-run.)
        </div>
      )}
    </div>
  );
}
