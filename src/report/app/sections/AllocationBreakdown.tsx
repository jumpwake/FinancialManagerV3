import { useState } from "react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { AnalysisOutput, AssetClass, DeploymentMove } from "../types";
import { COLORS } from "../theme";

ChartJS.register(ArcElement, Tooltip, Legend);

// Map asset_class → donut bucket label + color
const ASSET_BUCKET_MAP: Record<AssetClass, { label: string; color: string }> = {
  us_equity_total_market:     { label: "US Equity (Total Market)", color: COLORS.donut.us_equity },
  us_equity_large_cap:        { label: "US Equity (Large Cap)",    color: COLORS.donut.us_equity },
  us_equity_large_cap_growth: { label: "US Equity (Growth)",       color: COLORS.donut.sector_nasdaq },
  us_equity_small_mid:        { label: "US Equity (Small/Mid)",    color: COLORS.donut.us_equity },
  us_equity_sector:           { label: "Sector ETF",               color: COLORS.donut.sector_utilities },
  international_equity:       { label: "International",            color: COLORS.donut.international },
  us_bond_aggregate:          { label: "Fixed Income (Agg)",       color: COLORS.donut.fixed_income },
  us_bond_short:              { label: "Fixed Income (Short)",     color: COLORS.donut.fixed_income },
  us_bond_tips:               { label: "Fixed Income (TIPS)",      color: COLORS.donut.fixed_income },
  balanced:                   { label: "Balanced",                 color: COLORS.donut.balanced },
  target_date:                { label: "Target Date",              color: COLORS.donut.balanced },
  individual_stock:           { label: "Individual Stocks",        color: COLORS.donut.individual_stock },
  cash:                       { label: "Cash",                     color: COLORS.donut.cash },
  cash_pending:               { label: "Cash (Pending)",           color: COLORS.donut.cash },
};

interface BucketEntry {
  label: string;
  color: string;
  value: number;
}

function buildBuckets(holdings: AnalysisOutput["portfolio"]["holdings"]): BucketEntry[] {
  const map = new Map<string, BucketEntry>();
  for (const h of holdings) {
    const bucket = ASSET_BUCKET_MAP[h.asset_class] ?? { label: h.asset_class, color: COLORS.donut.other };
    const key = bucket.label;
    if (map.has(key)) {
      map.get(key)!.value += h.market_value;
    } else {
      map.set(key, { label: key, color: bucket.color, value: h.market_value });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value);
}

function fmt$(v: number) {
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function accountLabel(account_id: string, accounts: AnalysisOutput["accounts"]): string {
  if (!accounts) return account_id;
  return accounts.accounts.find(a => a.id === account_id)?.label ?? account_id;
}
function fmtPct(v: number) {
  return (v * 100).toFixed(1) + "%";
}

const cardStyle: React.CSSProperties = {
  background: COLORS.card,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: "12px 16px",
  flex: 1,
  minWidth: 0,
};

interface AllocationBreakdownProps {
  data: AnalysisOutput;
  inflightMoves?: Set<string>;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: DeploymentMove) => void;
}

export default function AllocationBreakdown({
  data,
  inflightMoves,
  onDiscussMove,
  onTrackMove,
}: AllocationBreakdownProps) {
  const { aggregates: agg, portfolio } = data;
  const total = agg.total_value;
  const sorted = [...portfolio.holdings].sort((a, b) => b.market_value - a.market_value);
  const buckets = buildBuckets(portfolio.holdings);
  const pendingHolding = portfolio.holdings.find(h => h.is_pending_deployment);

  const chartData = {
    labels: buckets.map(b => b.label),
    datasets: [
      {
        data: buckets.map(b => b.value),
        backgroundColor: buckets.map(b => b.color),
        borderColor: COLORS.bg,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { label: string; parsed: number }) =>
            ` ${ctx.label}: ${fmt$(ctx.parsed)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`,
        },
      },
    },
    cutout: "65%",
  };

  return (
    <div>
      {/* 4 stat cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Total Portfolio Value</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.text }}>{fmt$(total)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Equity Exposure</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.text }}>{fmtPct(agg.equity_weight)}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>Fixed Income</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.text }}>{fmtPct(agg.fixed_income_weight)}</div>
        </div>
        <div style={{ ...cardStyle, border: agg.pending_cash_weight > 0 ? `1px solid ${COLORS.amber}` : `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            Cash
            {agg.pending_cash_weight > 0 && (
              <span style={{ background: COLORS.pendingBg, color: COLORS.amber, fontSize: 10, padding: "1px 6px", borderRadius: 3, border: `1px solid ${COLORS.amber}` }}>
                T3 pending
              </span>
            )}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: agg.pending_cash_weight > 0 ? COLORS.amber : COLORS.text }}>
            {fmtPct(agg.cash_weight)}
          </div>
        </div>
      </div>

      {/* Legend + Donut */}
      <div style={{ display: "flex", gap: 24, marginBottom: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 200px" }}>
          <div style={{ marginBottom: 10, fontSize: 11, color: COLORS.textMuted, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Legend
          </div>
          {buckets.map(b => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: b.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: COLORS.text }}>{b.label}</span>
              <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: "auto" }}>
                {((b.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <div style={{ flex: "0 0 220px", maxWidth: 220 }}>
          <Doughnut data={chartData} options={chartOptions as never} />
        </div>
      </div>

      {/* Holdings table */}
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
              <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Holding</th>
              <th style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Account</th>
              <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Value</th>
              <th style={{ textAlign: "right", padding: "10px 14px", fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>Wt.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h, i) => (
              <tr key={`${h.account_id}::${h.ticker}`} style={{ borderBottom: i < sorted.length - 1 ? `1px solid ${COLORS.border}` : undefined }}>
                <td style={{ padding: "8px 14px", fontSize: 13, color: COLORS.text }}>
                  <span style={{ fontWeight: 500 }}>{h.ticker}</span>
                  <span style={{ color: COLORS.textMuted, marginLeft: 8, fontSize: 12 }}>{h.label}</span>
                  {h.is_pending_deployment && (
                    <span style={{ marginLeft: 8, background: COLORS.pendingBg, color: COLORS.amber, fontSize: 10, padding: "1px 5px", borderRadius: 3 }}>pending</span>
                  )}
                </td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: COLORS.textMuted }}>
                  {accountLabel(h.account_id, data.accounts)}
                </td>
                <td style={{ padding: "8px 14px", fontSize: 13, color: COLORS.text, textAlign: "right" }}>{fmt$(h.market_value)}</td>
                <td style={{ padding: "8px 14px", fontSize: 13, color: COLORS.textMuted, textAlign: "right" }}>{fmtPct(h.market_value / total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending deployment callout */}
      {pendingHolding && (
        <div style={{
          marginTop: 12,
          background: COLORS.pendingBg,
          border: `1px solid ${COLORS.amber}`,
          borderRadius: 6,
          padding: "12px 16px",
          fontSize: 13,
          color: COLORS.amber,
        }}>
          <strong>T3 note:</strong>{" "}
          {fmt$(pendingHolding.market_value)} in {pendingHolding.ticker} ({fmtPct(pendingHolding.market_value / total)}) is dry powder awaiting{" "}
          {pendingHolding.deployment_label ?? "scheduled"} deployment
          {pendingHolding.deployment_date ? ` ~${pendingHolding.deployment_date}` : ""}.
        </div>
      )}

      {/* Composition note */}
      {data.portfolio.holdings.some(h => h.underlying_composition) && (
        <div style={{
          marginTop: 12,
          fontSize: 12,
          color: COLORS.textMuted,
          lineHeight: 1.5,
        }}>
          Balanced and target-date funds are decomposed for scoring.{" "}
          {data.portfolio.holdings.filter(h => h.underlying_composition).map(h => {
            const c = h.underlying_composition!;
            const equityDollars = h.market_value * (c.us_equity + c.international_equity);
            const fiDollars = h.market_value * c.fixed_income;
            return `${h.ticker} (${fmt$(h.market_value)}) contributes ~${fmt$(equityDollars)} equity / ~${fmt$(fiDollars)} FI.`;
          }).join(" ")}
        </div>
      )}

      {/* Cross-account groups note */}
      {data.aggregates.cross_account_groups.length > 0 && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
          color: COLORS.textMuted,
          fontStyle: "italic",
        }}>
          Note: {data.aggregates.cross_account_groups.map(g =>
            `${g.tickers_by_account.map(t => t.ticker).join(" / ")} (${g.label})`
          ).join("; ")} held across multiple accounts — expected for cross-broker portfolios, not a flag.
        </div>
      )}

      {data.tactical_advisor?.deployment_recommendation && (
        <PostT3Toggle
          deployment={data.tactical_advisor.deployment_recommendation}
          portfolio={data.portfolio}
          accounts={data.accounts}
          currentGrade={data.portfolio_grade}
          inflightMoves={inflightMoves}
          onDiscussMove={onDiscussMove}
          onTrackMove={onTrackMove}
        />
      )}
    </div>
  );
}

function PostT3Toggle({
  deployment,
  portfolio,
  accounts: _accounts,
  currentGrade,
  inflightMoves,
  onDiscussMove,
  onTrackMove,
}: {
  deployment: NonNullable<NonNullable<AnalysisOutput["tactical_advisor"]>["deployment_recommendation"]>;
  portfolio: AnalysisOutput["portfolio"];
  accounts: AnalysisOutput["accounts"];
  currentGrade: string;
  inflightMoves?: Set<string>;
  onDiscussMove?: (move_id: string) => void;
  onTrackMove?: (move: DeploymentMove) => void;
}) {
  const [open, setOpen] = useState(false);
  const pendingValue = portfolio.holdings
    .filter(h => h.is_pending_deployment)
    .reduce((s, h) => s + h.market_value, 0);

  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          padding: "8px 14px",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 13,
          width: "100%",
          textAlign: "left",
        }}
      >
        {open ? "▼" : "▶"}  Project post-deployment allocation
        <span style={{ color: COLORS.textMuted, marginLeft: 8 }}>
          ({fmt$(pendingValue)} pending → {currentGrade} → {deployment.projected_grade})
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}>
          <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 12, lineHeight: 1.6 }}>
            {deployment.summary}
          </div>

          {deployment.moves.map(move => {
            const isInflight = inflightMoves?.has(move.id) ?? false;
            return (
              <div key={move.id} style={{ marginBottom: 10, padding: "10px 12px", background: COLORS.bg, borderLeft: `3px solid ${COLORS.amber}`, borderRadius: 4 }}>
                <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 4 }}>
                  <strong>{fmt$(move.dollars)}</strong> → <strong>{move.ticker}</strong> in <em>{move.target_account}</em>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{move.rationale}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onDiscussMove?.(move.id)}
                    style={{ background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, padding: "2px 6px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                  >
                    💬 Discuss
                  </button>
                  <button
                    type="button"
                    onClick={() => onTrackMove?.(move)}
                    disabled={isInflight}
                    style={{ background: "transparent", border: `1px solid ${COLORS.amber}`, color: COLORS.amber, padding: "2px 6px", borderRadius: 4, cursor: isInflight ? "not-allowed" : "pointer", fontSize: 11, opacity: isInflight ? 0.5 : 1 }}
                  >
                    {isInflight ? "Adding…" : "+ Situation"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
