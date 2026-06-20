import { useCallback, useEffect, useState } from "react";
import { AnalysisOutput, ChatScope, Situation, TacticalMove, ChatMessage, SpeculativeHold } from "./types";
import { COLORS } from "./theme";
import { useIsMobile } from "./hooks/useIsMobile";
import { appPath } from "./api";
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
import TopBar from "./TopBar";
import { Sidebar } from "./sidebar/Sidebar";
import { initialChatState, persistCollapsed } from "./sidebar/chatStore";
import Landing from "./Landing";

export default function App() {
  const isMobile = useIsMobile();
  const [data, setData] = useState<AnalysisOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = still checking /api/me; true/false = signed-in state known.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [scope, setScope] = useState<ChatScope>({ type: "global" });
  const [liveSituations, setLiveSituations] = useState<Situation[]>([]);
  const [liveSpeculativeHolds, setLiveSpeculativeHolds] = useState<SpeculativeHold[]>([]);
  const [inflightMoves, setInflightMoves] = useState<Set<string>>(new Set());
  const [profileOpen, setProfileOpen] = useState(false);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const [chatCollapsed, setChatCollapsed] = useState(() => initialChatState().collapsed);
  const toggleChat = useCallback(() => setChatCollapsed((c) => !c), []);
  const [initialChatHistory, setInitialChatHistory] = useState<ChatMessage[]>([]);
  // Incremented every time a Discuss button fires. Sidebar watches this and
  // clears the chat (server + local) when it changes, so each Discuss starts
  // a fresh thread scoped to the clicked item.
  const [chatResetEpoch, setChatResetEpoch] = useState(0);

  useEffect(() => persistCollapsed(chatCollapsed), [chatCollapsed]);

  // Discuss handlers everywhere call this — it sets the scope, opens the chat
  // sheet, and bumps chatResetEpoch so Sidebar clears the existing thread.
  const startDiscussion = useCallback((newScope: ChatScope) => {
    setScope(newScope);
    setChatCollapsed(false);
    setChatResetEpoch((e) => e + 1);
  }, []);

  const loadAnalysis = useCallback(async () => {
    try {
      const r = await fetch(appPath("/api/analysis"));
      if (r.status === 401) {
        // Session ended — drop back to the landing page.
        setAuthed(false);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as AnalysisOutput;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadSituations = useCallback(async () => {
    try {
      const r = await fetch(appPath("/api/situations"));
      if (!r.ok) return;
      const list = (await r.json()) as Situation[];
      setLiveSituations(list);
    } catch {
      // Network error — keep prior state; the 5s poll will retry.
    }
  }, []);

  const loadSpeculativeHolds = useCallback(async () => {
    try {
      const r = await fetch(appPath("/api/speculative-holds"));
      if (!r.ok) return;
      const list = (await r.json()) as SpeculativeHold[];
      setLiveSpeculativeHolds(list);
    } catch {
      // Network error — keep prior state.
    }
  }, []);

  // On mount, check whether a user is signed in before loading anything.
  useEffect(() => {
    let cancelled = false;
    fetch(appPath("/api/me"))
      .then((r) => { if (!cancelled) setAuthed(r.ok); })
      .catch(() => { if (!cancelled) setAuthed(false); });
    return () => { cancelled = true; };
  }, []);

  // Load report data only once we know the user is signed in.
  useEffect(() => {
    if (authed !== true) return;
    loadAnalysis();
    loadSituations();
    loadSpeculativeHolds();
    const id = setInterval(loadSituations, 5000);
    return () => clearInterval(id);
  }, [authed, loadAnalysis, loadSituations, loadSpeculativeHolds]);

  // Load persisted chat history once we know the user is signed in.
  useEffect(() => {
    if (authed !== true) return;
    let cancelled = false;
    fetch(appPath("/api/chat"))
      .then((r) => (r.ok ? r.json() : []))
      .then((h: ChatMessage[]) => { if (!cancelled) setInitialChatHistory(h ?? []); })
      .catch(() => {/* leave empty */});
    return () => { cancelled = true; };
  }, [authed]);

  const handleResolve = useCallback(
    async (sit: Situation) => {
      await fetch(appPath(`/api/situations/${sit.id}`), {
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
      await fetch(appPath(`/api/situations/${sit.id}`), { method: "DELETE" });
      await loadSituations();
    },
    [loadSituations],
  );

  const addSpeculativeHold = useCallback(
    async (ticker: string, reason?: string) => {
      try {
        const r = await fetch(appPath("/api/speculative-holds"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, reason }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await loadSpeculativeHolds();
      } catch (err) {
        console.warn("Failed to add speculative hold:", err);
      }
    },
    [loadSpeculativeHolds],
  );

  const removeSpeculativeHold = useCallback(
    async (ticker: string) => {
      try {
        await fetch(appPath(`/api/speculative-holds/${encodeURIComponent(ticker)}`), {
          method: "DELETE",
        });
        await loadSpeculativeHolds();
      } catch (err) {
        console.warn("Failed to remove speculative hold:", err);
      }
    },
    [loadSpeculativeHolds],
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
      const r = await fetch(appPath("/api/situations"), {
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

  if (authed === null) {
    return (
      <div style={{ padding: "2rem", color: COLORS.textMuted }}>Checking sign-in…</div>
    );
  }

  if (!authed) {
    return <Landing />;
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", color: COLORS.red }}>
        Failed to load analysis: {error}
        <div style={{ color: COLORS.textMuted, marginTop: 8, fontSize: 13 }}>
          No analysis has been published yet. Run <code>npm run publish</code> locally to
          analyze and upload your portfolio.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div style={{ padding: "2rem", color: COLORS.textMuted }}>Loading analysis...</div>;
  }

  const typedData = data;
  const situations = liveSituations;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <TopBar onOpenProfile={() => setProfileOpen(true)} onToggleChat={toggleChat} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
          flex: 1,
        }}
      >
      <main
        style={{
          padding: isMobile ? "1.25rem 1rem" : "2rem 1rem",
          maxWidth: 900,
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif",
          width: "100%",
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 500, marginBottom: 4, color: COLORS.text }}>
            {typedData.portfolio.account_label}
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textMuted }}>
            Generated {new Date(typedData.generated_at).toLocaleDateString()} ·{" "}
            {typedData.portfolio.holdings.length} holdings · Grade{" "}
            <strong style={{ color: COLORS.text }}>{typedData.portfolio_grade}</strong>{" "}
            ({typedData.portfolio_score.toFixed(1)}/10)
          </p>
          {typedData.narratives?.headline_summary && (
            <p style={{ fontSize: isMobile ? 13 : 14, color: "#bbb", marginTop: 12, lineHeight: 1.6 }}>
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

        <OpenSituations
          situations={situations}
          analysis={typedData}
          onDiscuss={(sit) => startDiscussion({ type: "situation", situation_id: sit.id })}
          onResolve={handleResolve}
          onDelete={handleDelete}
        />

        <Section label="1 — Allocation breakdown">
          <AllocationBreakdown
            data={typedData}
            inflightMoves={inflightMoves}
            onDiscussMove={(id) => startDiscussion({ type: "tactical_move", move_id: id })}
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
            onDiscuss={(id) => startDiscussion({ type: "dimension", dimension_id: id })}
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
          <Gaps data={typedData} onDiscuss={(k) => startDiscussion({ type: "gap", finding_key: k })} />
        </Section>
        <Section label="8 — Flags">
          <Flags
            data={typedData}
            speculativeHolds={liveSpeculativeHolds}
            onAddHold={addSpeculativeHold}
            onRemoveHold={removeSpeculativeHold}
            onDiscuss={(k) => startDiscussion({ type: "flag", finding_key: k })}
          />
        </Section>
        <div id="next-moves">
          <Section label="9 — Next moves">
            <NextMoves
              data={typedData}
              inflightMoves={inflightMoves}
              onDiscussMove={(id) => startDiscussion({ type: "tactical_move", move_id: id })}
              onTrackMove={(move) => handleTrackMove(move)}
            />
          </Section>
        </div>
      </main>

      <Sidebar
        scope={scope}
        onScopeChange={setScope}
        collapsed={chatCollapsed}
        onCollapsedChange={setChatCollapsed}
        initialHistory={initialChatHistory}
        analysis={typedData}
        situations={situations}
        notes={[]}
        chatResetEpoch={chatResetEpoch}
      />
      </div>

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
