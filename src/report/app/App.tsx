import { useCallback, useEffect, useState } from "react";
import { AnalysisOutput, ChatScope, Situation, TacticalMove } from "./types";
import { COLORS } from "./theme";
import AllocationBreakdown from "./sections/AllocationBreakdown";
import BenchmarkComparison from "./sections/BenchmarkComparison";
import DimensionScorecard from "./sections/DimensionScorecard";
import KeyFindings from "./sections/KeyFindings";
import RadarChart from "./sections/RadarChart";
import AdditionalTakeaways from "./sections/AdditionalTakeaways";
import Gaps from "./sections/Gaps";
import Flags from "./sections/Flags";
import NextMoves from "./sections/NextMoves";
import { OpenSituations } from "./sections/OpenSituations";
import ProfileDrawer from "./sections/ProfileDrawer";
import { Sidebar } from "./sidebar/Sidebar";

export default function App() {
  const [data, setData] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ChatScope>({ type: "global" });
  const [liveSituations, setLiveSituations] = useState<Situation[]>([]);
  const [inflightMoves, setInflightMoves] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const loadAnalysis = useCallback(async () => {
    try {
      const r = await fetch("/analysis.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as AnalysisOutput;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadSituations = useCallback(async () => {
    try {
      const r = await fetch("/api/situations");
      if (!r.ok) return;
      const list = (await r.json()) as Situation[];
      setLiveSituations(list);
    } catch {
      // Silently fall back to analysis.json situations
    }
  }, []);

  useEffect(() => {
    loadAnalysis();
    loadSituations();
    const id = setInterval(loadSituations, 5000);
    return () => clearInterval(id);
  }, [loadAnalysis, loadSituations]);

  const handleResolve = useCallback(
    async (sit: Situation) => {
      await fetch(`/api/situations/${sit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed", closure_reason: "completed" }),
      });
      await loadSituations();
    },
    [loadSituations],
  );

  const handleDelete = useCallback(
    async (sit: Situation) => {
      await fetch(`/api/situations/${sit.id}`, { method: "DELETE" });
      await loadSituations();
    },
    [loadSituations],
  );

  const handleTrackMove = useCallback(async (move: TacticalMove) => {
    // Guard against double-submission: if this move id is already in-flight, do nothing.
    // Using a functional setState to read+update atomically without depending on a stale closure.
    let alreadyInflight = false;
    setInflightMoves(prev => {
      if (prev.has(move.id)) {
        alreadyInflight = true;
        return prev;
      }
      const next = new Set(prev);
      next.add(move.id);
      return next;
    });
    if (alreadyInflight) return;

    const target_date = new Date();
    target_date.setDate(target_date.getDate() + 30);

    const payload = {
      title: move.action.slice(0, 80),
      intent: move.rationale,
      status: "open" as const,
      target_date: target_date.toISOString().slice(0, 10),
      related_findings: [] as string[],
      portfolio_effects: move.category === "deploy_cash"
        ? [{ type: "mark_cash_pending", amount_usd: move.dollars, deployment_label: move.target_account }]
        : [] as never[],
    };

    try {
      const r = await fetch("/api/situations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadSituations();
      setScope({ type: "global" });
    } catch (err) {
      console.warn("Failed to create Situation:", err);
    } finally {
      setInflightMoves(prev => {
        const next = new Set(prev);
        next.delete(move.id);
        return next;
      });
    }
  }, [loadSituations]);

  if (error) {
    return (
      <div style={{ padding: "2rem", color: COLORS.red }}>
        Failed to load analysis: {error}
        <div style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }}>
          Did you run <code>npm run analyze</code> first? It writes <code>output/analysis.json</code>.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: "2rem", color: COLORS.textMuted }}>Loading analysis...</div>;
  }

  const typedData = data;
  // Prefer live situations from /api/situations (always current) over the
  // snapshot baked into analysis.json (stale until next `npm run analyze`).
  const situations = liveSituations.length > 0 ? liveSituations : (typedData.situations ?? []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", minHeight: "100vh" }}>
      <main style={{ padding: "2rem 1rem", maxWidth: 900, margin: "0 auto", fontFamily: "system-ui, sans-serif", width: "100%" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4, color: COLORS.text }}>
              {typedData.portfolio.account_label}
            </h1>
            <p style={{ fontSize: 13, color: COLORS.textMuted }}>
              Generated {new Date(typedData.generated_at).toLocaleDateString()} ·{" "}
              {typedData.portfolio.holdings.length} holdings · Grade{" "}
              <strong style={{ color: COLORS.text }}>{typedData.portfolio_grade}</strong>{" "}
              ({typedData.portfolio_score.toFixed(1)}/10)
            </p>
            {typedData.narratives?.headline_summary && (
              <p style={{ fontSize: 14, color: "#bbb", marginTop: 12, lineHeight: 1.6 }}>
                {typedData.narratives.headline_summary}
              </p>
            )}
            <a
              href="#next-moves"
              style={{
                fontSize: 12,
                color: COLORS.accentBlue,
                textDecoration: "none",
                marginTop: 10,
                display: "inline-block",
              }}
            >
              ↓ Jump to recommended moves
            </a>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            aria-label="User Profile"
            title="User Profile"
            style={{
              flexShrink: 0,
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              color: COLORS.textMuted,
              padding: "6px 9px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            👤
          </button>
        </div>

        <OpenSituations
          situations={situations}
          onDiscuss={(sit) => setScope({ type: "situation", situation_id: sit.id })}
          onResolve={handleResolve}
          onDelete={handleDelete}
        />

        <Section label="1 — Allocation breakdown">
          <AllocationBreakdown
            data={typedData}
            inflightMoves={inflightMoves}
            onDiscussMove={(id) => setScope({ type: "tactical_move", move_id: id })}
            onTrackMove={(deploymentMove) => handleTrackMove({
              id: deploymentMove.id,
              category: "deploy_cash",
              action: `Buy $${deploymentMove.dollars.toLocaleString()} of ${deploymentMove.ticker} in ${deploymentMove.target_account}`,
              target_account: deploymentMove.target_account,
              dollars: deploymentMove.dollars,
              rationale: deploymentMove.rationale,
              scenarios_addressed: [],
            })}
          />
        </Section>
        <Section label="2 — Benchmark comparison">
          <BenchmarkComparison data={typedData} />
        </Section>
        <Section label="3 — Dimension scorecard">
          <DimensionScorecard
            data={typedData}
            onDiscuss={(id) => setScope({ type: "dimension", dimension_id: id })}
          />
        </Section>
        <Section label="4 — Key findings">
          <KeyFindings data={typedData} />
        </Section>
        <Section label="5 — Radar">
          <RadarChart data={typedData} />
        </Section>
        <Section label="6 — Additional takeaways">
          <AdditionalTakeaways data={typedData} />
        </Section>
        <Section label="7 — Gaps">
          <Gaps data={typedData} onDiscuss={(k) => setScope({ type: "gap", finding_key: k })} />
        </Section>
        <Section label="8 — Flags">
          <Flags data={typedData} onDiscuss={(k) => setScope({ type: "flag", finding_key: k })} />
        </Section>
        <div id="next-moves">
          <Section label="9 — Next moves">
            <NextMoves
              data={typedData}
              inflightMoves={inflightMoves}
              onDiscussMove={(id) => setScope({ type: "tactical_move", move_id: id })}
              onTrackMove={(move) => handleTrackMove(move)}
            />
          </Section>
        </div>
      </main>

      <Sidebar
        scope={scope}
        onScopeChange={setScope}
        initialHistory={[]}
      />

      <ProfileDrawer open={profileOpen} onClose={closeProfile} />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <p style={{
        fontSize: 11,
        fontWeight: 500,
        color: COLORS.textMuted,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 12,
      }}>
        {label}
      </p>
      {children}
    </div>
  );
}
