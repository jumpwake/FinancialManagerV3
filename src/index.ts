import * as fs from "node:fs";
import * as path from "node:path";
import {
  normalizeFidelityAccounts,
  normalizeEmpowerAccounts,
  normalizeVanguardAccounts,
  consolidatePortfolio,
} from "./intake/normalize";
import { parsePortfolio } from "./intake/parsePortfolio";
import { parseMacro } from "./intake/parseMacro";
import { computeAggregates } from "./engine/aggregates";
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./engine/dimensions";
import { generateFlags, generateGapItems, generatePlanPhases } from "./engine/plan";
import { REFERENCE_MODELS } from "./engine/benchmarks";
import { generateNarratives } from "./ai/narratives";
import type { Finding } from "./types";

const SAMPLE_DIR = "data/SamplePortfolio";
const MACRO_FILE = "data/macro.json";
const OUTPUT_FILE = "output/analysis.json";

function loadJSON(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf-8"));
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

async function main() {
  console.log("Portfolio Analyzer V3 — loading raw brokerage data...");

  // Normalize each broker's exports into a flat Holding[]
  const fidelity = normalizeFidelityAccounts(loadJSON(`${SAMPLE_DIR}/20260509_FidelityRetirement.json`) as any);
  const empower  = normalizeEmpowerAccounts(loadJSON(`${SAMPLE_DIR}/20260509_EmpowerKelly.json`) as any);
  const vb       = normalizeVanguardAccounts(loadJSON(`${SAMPLE_DIR}/20260509_VanguardBusiness.json`) as any);
  const vkdb     = normalizeVanguardAccounts(loadJSON(`${SAMPLE_DIR}/20260509_VanguardKDB.json`) as any);
  const vp       = normalizeVanguardAccounts(loadJSON(`${SAMPLE_DIR}/20260509_VanguardPersonal.json`) as any);

  const allHoldings = [...fidelity, ...empower, ...vb, ...vkdb, ...vp];
  console.log(`  Fidelity:           ${fidelity.length} holdings`);
  console.log(`  Empower:            ${empower.length} holdings`);
  console.log(`  Vanguard Business:  ${vb.length} holdings`);
  console.log(`  Vanguard KDB:       ${vkdb.length} holdings`);
  console.log(`  Vanguard Personal:  ${vp.length} holdings`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Total (pre-dedupe): ${allHoldings.length} holdings`);

  // Consolidate duplicates across accounts/brokers
  const consolidated = consolidatePortfolio(allHoldings, "2026-05-09", "All Accounts");
  console.log(`  After consolidation: ${consolidated.holdings.length} unique holdings`);

  // Validate via zod
  const portfolio = parsePortfolio(consolidated);
  const macro = parseMacro(loadJSON(MACRO_FILE));
  console.log(`  Macro regime: ${macro.market_regime}`);

  // Run engine
  const aggregates = computeAggregates(portfolio);
  const dimension_scores = scoreAllDimensions(portfolio, aggregates, macro);
  const portfolio_score = computePortfolioScore(dimension_scores);
  const portfolio_grade = scoreToGrade(portfolio_score);
  const flags = generateFlags(portfolio, aggregates, macro);
  const gap_items = generateGapItems(aggregates, dimension_scores, macro);
  const { phases: plan_phases, trajectory: score_trajectory } =
    generatePlanPhases(aggregates, macro, portfolio_score);

  // Generate AI narratives (single Anthropic API call)
  let narratives = null;
  let findings: Finding[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("");
    console.log("Calling Anthropic API for narratives...");
    try {
      narratives = await generateNarratives({
        portfolio,
        macro,
        aggregates,
        portfolio_score,
        portfolio_grade,
        dimension_scores,
        reference_models: REFERENCE_MODELS,
        flags,
      });
      findings = [
        ...narratives.strengths.map(s => ({ type: "strength" as const, title: "Strength", body: s })),
        ...narratives.gaps.map(g => ({ type: "gap" as const, title: "Gap", body: g })),
      ];
      console.log("  Narratives generated.");
    } catch (err) {
      console.warn("  Narratives generation failed:", err instanceof Error ? err.message : err);
      console.warn("  Continuing without AI narratives.");
    }
  } else {
    console.log("");
    console.log("ANTHROPIC_API_KEY not set — skipping AI narratives. Set it in .env to enable.");
  }

  // Assemble the analysis output
  const output = {
    generated_at: new Date().toISOString(),
    portfolio,
    macro,
    aggregates,
    portfolio_score,
    portfolio_grade,
    dimension_scores,
    reference_models: REFERENCE_MODELS,
    flags,
    gap_items,
    plan_phases,
    score_trajectory,
    findings,
    narratives,  // null if API key wasn't set
  };

  // Write JSON
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  // Console summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${portfolio.account_label} — ${portfolio.snapshot_date}`);
  console.log(`  Total value: ${fmtMoney(aggregates.total_value)}`);
  console.log(`  Grade: ${portfolio_grade}  Score: ${portfolio_score.toFixed(2)} / 10`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log("ALLOCATION");
  console.log(`  Equity:        ${fmtPct(aggregates.equity_weight)}`);
  console.log(`  Fixed income:  ${fmtPct(aggregates.fixed_income_weight)}`);
  console.log(`  International: ${fmtPct(aggregates.international_weight)}`);
  console.log(`  Balanced:      ${fmtPct(aggregates.balanced_weight)}`);
  console.log(`  Cash (idle):   ${fmtPct(aggregates.idle_cash_weight)}`);
  if (aggregates.pending_cash_weight > 0) {
    console.log(`  Cash (pending):${fmtPct(aggregates.pending_cash_weight)}`);
  }
  console.log(`  Holdings:      ${aggregates.holding_count} (top 3: ${aggregates.top3_tickers.join(", ")} = ${fmtPct(aggregates.top3_weight)})`);
  console.log("");
  console.log("DIMENSION SCORECARD");
  for (const d of dimension_scores) {
    const dot = d.rating === "green" ? "●" : d.rating === "yellow" ? "◐" : "○";
    console.log(`  ${dot} ${d.label.padEnd(28)} ${d.score.toFixed(1).padStart(4)} / 10   ${d.display_value}`);
  }
  console.log("");
  console.log("BENCHMARK COMPARISON");
  console.log(`  Your portfolio:    ${portfolio_grade}   ${portfolio_score.toFixed(1)} / 10`);
  for (const m of REFERENCE_MODELS) {
    console.log(`  ${m.label.padEnd(18)} ${m.grade}   ${m.score.toFixed(1)} / 10`);
  }
  console.log("");
  if (flags.length > 0) {
    console.log("FLAGS");
    for (const f of flags) {
      const tag = f.severity === "red" ? "[RED]   " : "[YELLOW]";
      console.log(`  ${tag} ${f.title}`);
      console.log(`           ${f.body}`);
    }
    console.log("");
  }
  if (gap_items.length > 0) {
    console.log("GAPS");
    for (const g of gap_items) {
      const tag = g.type === "red" ? "[RED]  " : g.type === "amber" ? "[AMBER]" : "[BLUE] ";
      console.log(`  ${tag} ${g.title} — ${g.body}`);
    }
    console.log("");
  }
  console.log("DEVELOPMENT PLAN");
  for (const phase of plan_phases) {
    console.log(`  Phase ${phase.phase} — ${phase.title} (${phase.timing}) → ${phase.projected_grade}`);
    for (const a of phase.actions) {
      console.log(`    • [${a.category}] ${a.description}`);
    }
  }
  console.log("");
  console.log("SCORE TRAJECTORY");
  for (const p of score_trajectory) {
    console.log(`  ${p.label.padEnd(18)} ${p.grade}   ${p.score.toFixed(1)} / 10`);
  }
  if (narratives) {
    console.log("");
    console.log("AI NARRATIVES");
    console.log("");
    console.log("  Headline:");
    console.log(`    ${narratives.headline_summary}`);
    console.log("");
    console.log("  Benchmark context:");
    console.log(`    ${narratives.benchmark_context}`);
    console.log("");
    console.log("  Strengths:");
    for (const s of narratives.strengths) console.log(`    + ${s}`);
    console.log("");
    console.log("  Gaps:");
    for (const g of narratives.gaps) console.log(`    - ${g}`);
    console.log("");
    console.log("  Additional takeaways:");
    for (const t of narratives.additional_takeaways) console.log(`    > ${t}`);
    console.log("");
    console.log("  Phase 1 macro note:");
    console.log(`    ${narratives.phase1_macro_note}`);
    console.log("");
  }
  console.log("");
  console.log(`Full analysis written to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
