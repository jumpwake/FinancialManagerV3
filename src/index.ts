import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  normalizeFidelityAccounts,
  normalizeEmpowerAccounts,
  normalizeVanguardAccounts,
  consolidatePortfolio,
} from "./intake/normalize";
import { parseAccountsCSV } from "./intake/parseAccountsCSV";
import { parsePortfolio } from "./intake/parsePortfolio";
import { parseMacro } from "./intake/parseMacro";
import { computeAggregates } from "./engine/aggregates";
import { scoreAllDimensions, computePortfolioScore, scoreToGrade } from "./engine/dimensions";
import { generateFlags, generateGapItems, generatePlanPhases } from "./engine/plan";
import { REFERENCE_MODELS } from "./engine/benchmarks";
import { generateNarratives } from "./ai/narratives";
import { loadUserContext, saveUserContext } from "./server/userContextStore";
import { applyPortfolioEffects } from "./engine/portfolioEffects";
import { applyNoteSuppressions } from "./engine/suppression";
import { runPulseCheck } from "./ai/pulseCheck";
import { runTacticalAdvisor } from "./ai/tacticalAdvisor";
import type { AccountConfig, Holding, Finding, PulseVerdict, TacticalAdvisorOutput } from "./types";

const SAMPLE_DIR = process.env.PORTFOLIO_DIR ?? "data/SamplePortfolio";
const MACRO_FILE = "data/macro.json";
const OUTPUT_FILE = "output/analysis.json";
const USER_CONTEXT_FILE = "data/user-context.json";

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

  const userContext = loadUserContext(USER_CONTEXT_FILE);
  if (userContext.situations.length || userContext.notes.length) {
    console.log(
      `  Loaded user-context.json: ${userContext.situations.length} situations, ${userContext.notes.length} notes`,
    );
  }

  // Load accounts config. The user maintains data/accounts.csv (gitignored).
  // If it's missing, fall back to the committed example for first-run usability.
  const accountsFile = fs.existsSync("data/accounts.csv")
    ? "data/accounts.csv"
    : "data/accounts.example.csv";
  const accounts: AccountConfig = parseAccountsCSV(
    fs.readFileSync(accountsFile, "utf-8"),
    SAMPLE_DIR,
  );
  console.log(`  Accounts config: ${accounts.accounts.length} accounts from ${accountsFile}`);

  // Build account-number → account_id and source_file → [account_id] indices
  // for per-sub-account routing.
  const accountByNumber = new Map<string, typeof accounts.accounts[number]>();
  const accountIdsBySourceFile = new Map<string, typeof accounts.accounts[number][]>();
  for (const a of accounts.accounts) {
    for (const num of a.account_numbers ?? []) {
      accountByNumber.set(num, a);
    }
    for (const sf of a.source_files) {
      const arr = accountIdsBySourceFile.get(sf) ?? [];
      arr.push(a);
      accountIdsBySourceFile.set(sf, arr);
    }
  }

  // Iterate raw broker files; split sub-accounts by account_number when the
  // user's config names them individually, otherwise fall back to whole-file.
  const SAMPLE_FILES = fs.readdirSync(SAMPLE_DIR).filter((f) => f.endsWith(".json")).sort();
  const allHoldings: Holding[] = [];
  for (const filename of SAMPLE_FILES) {
    const rawRoot = loadJSON(`${SAMPLE_DIR}/${filename}`);
    const subAccounts = (Array.isArray(rawRoot) ? rawRoot : [rawRoot]) as Array<{
      account_number?: string;
      account_id?: string;
      account_name?: string;
    }>;

    const haveSubAccountConfig = subAccounts.some(
      (s) => accountByNumber.has(s.account_number ?? s.account_id ?? s.account_name ?? ""),
    );

    if (haveSubAccountConfig) {
      // Per-sub-account routing (preferred)
      for (const sub of subAccounts) {
        const num = sub.account_number ?? sub.account_id ?? sub.account_name ?? "";
        const acct = accountByNumber.get(num);
        if (!acct) {
          console.warn(`  ⚠ ${filename} sub-account ${num} has no config entry — skipping`);
          continue;
        }
        let normalized: Holding[];
        if (acct.broker === "Fidelity") normalized = normalizeFidelityAccounts([sub] as any, acct.id);
        else if (acct.broker === "Empower") normalized = normalizeEmpowerAccounts([sub] as any, acct.id);
        else if (acct.broker === "Vanguard") normalized = normalizeVanguardAccounts([sub] as any, acct.id);
        else throw new Error(`Unsupported broker ${acct.broker} for ${filename}`);
        console.log(`  ${acct.label.padEnd(36)} ${normalized.length} holdings  (${num})`);
        allHoldings.push(...normalized);
      }
    } else {
      // No sub-accounts matched by number — find the account whose source_files
      // claim this whole file (typical for Empower exports where there's no
      // distinct account_number).
      const owners = accountIdsBySourceFile.get(filename) ?? [];
      if (owners.length === 0) {
        console.warn(`  ⚠ ${filename} has no entry in data/accounts.csv — skipping`);
        continue;
      }
      const account = owners[0];
      let normalized: Holding[];
      if (account.broker === "Fidelity") normalized = normalizeFidelityAccounts(rawRoot as any, account.id);
      else if (account.broker === "Empower") normalized = normalizeEmpowerAccounts(rawRoot as any, account.id);
      else if (account.broker === "Vanguard") normalized = normalizeVanguardAccounts(rawRoot as any, account.id);
      else throw new Error(`Unsupported broker ${account.broker} for ${filename}`);
      console.log(`  ${account.label.padEnd(36)} ${normalized.length} holdings`);
      allHoldings.push(...normalized);
    }
  }
  console.log(`  ─────────────────────────────`);
  console.log(`  Total (pre-dedupe): ${allHoldings.length} holdings`);

  // Consolidate duplicates across accounts/brokers
  const consolidated = consolidatePortfolio(allHoldings, "2026-05-09", "All Accounts");
  console.log(`  After consolidation: ${consolidated.holdings.length} unique holdings`);

  // Validate via zod
  const portfolio = parsePortfolio(consolidated);
  const macro = parseMacro(loadJSON(MACRO_FILE));
  console.log(`  Macro regime: ${macro.market_regime}`);

  // Apply open Situation portfolio_effects before scoring
  const effectedPortfolio = applyPortfolioEffects(portfolio, userContext.situations);

  // Run engine
  const aggregates = computeAggregates(effectedPortfolio, accounts);
  const dimension_scores = scoreAllDimensions(effectedPortfolio, aggregates, macro, accounts);
  const portfolio_score = computePortfolioScore(dimension_scores);
  const portfolio_grade = scoreToGrade(portfolio_score);
  const rawFlags = generateFlags(effectedPortfolio, aggregates, macro, accounts);
  const rawGapItems = generateGapItems(aggregates, dimension_scores, macro);

  // Apply Note suppressions (cosmetic — flags retain finding_key, annotated with suppressed_by)
  const suppressed = applyNoteSuppressions(rawFlags, rawGapItems, userContext.notes);
  const flags = suppressed.flags;
  const gap_items = suppressed.gaps;

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
        portfolio: effectedPortfolio,
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

  // Pulse-check every open Situation (one Anthropic call per open situation)
  const openSituations = userContext.situations.filter((s) => s.status === "open");
  if (openSituations.length > 0 && process.env.ANTHROPIC_API_KEY) {
    console.log("");
    console.log(`Running pulse-check on ${openSituations.length} open situation(s)...`);
    await Promise.all(
      openSituations.map(async (sit) => {
        const related_flags = flags.filter((f) =>
          sit.related_findings.includes(f.finding_key),
        );
        let verdict: PulseVerdict;
        try {
          verdict = await runPulseCheck({
            situation: sit,
            macro,
            portfolio: effectedPortfolio,
            related_flags,
          });
          console.log(`  ${sit.title}: ${verdict.verdict.toUpperCase()} (${verdict.confidence})`);
        } catch (err) {
          verdict = {
            run_at: new Date().toISOString(),
            macro_snapshot: {
              regime: macro.market_regime,
              vix: macro.vix,
              yield_curve_10y_2y: macro.yield_curve_spread_10y_2y,
              hy_credit_spread_oas_bps: macro.hy_credit_spread_oas_bps,
              lei_consecutive_declines: macro.lei_consecutive_declines,
            },
            verdict: "monitor",
            confidence: "low",
            rationale: "",
            suggested_action: "",
            reconsider_when: null,
            error: err instanceof Error ? err.message : String(err),
          };
          console.warn(`  ${sit.title}: pulse-check failed — ${verdict.error}`);
        }
        sit.verdict_history.push(verdict);
        sit.updated_at = verdict.run_at;
      }),
    );
  } else if (openSituations.length > 0) {
    console.log("");
    console.log(`${openSituations.length} open situation(s) but ANTHROPIC_API_KEY not set — skipping pulse-check.`);
  }

  // Persist updated user-context if pulse-check produced verdicts
  if (openSituations.length > 0) {
    saveUserContext(USER_CONTEXT_FILE, userContext);
  }

  // Generate tactical advisor recommendations (single Anthropic API call)
  let tactical_advisor: TacticalAdvisorOutput | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("");
    console.log("Calling Anthropic API for tactical advisor recommendations...");
    try {
      tactical_advisor = await runTacticalAdvisor({
        portfolio: effectedPortfolio,
        aggregates,
        macro,
        dimension_scores,
        portfolio_score,
        portfolio_grade,
        flags,
        gap_items,
        accounts,
        open_situations: userContext.situations,
      });
      console.log(`  Tactical plan: ${tactical_advisor.tactical_plan.next_7_days.length} moves in next 7d, ${tactical_advisor.tactical_plan.next_30_days.length} moves in next 30d`);
      if (tactical_advisor.deployment_recommendation) {
        console.log(`  Deployment: ${tactical_advisor.deployment_recommendation.moves.length} moves, projected grade ${tactical_advisor.deployment_recommendation.projected_grade}`);
      }
    } catch (err) {
      console.warn("  Tactical advisor failed:", err instanceof Error ? err.message : err);
    }
  }

  // Assemble the analysis output
  const output = {
    generated_at: new Date().toISOString(),
    portfolio: effectedPortfolio,
    macro,
    aggregates,
    accounts,
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
    tactical_advisor,  // null if API key wasn't set or call failed
    situations: userContext.situations,
    notes: userContext.notes,
  };

  // Write JSON
  fs.mkdirSync("output", { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  // Console summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  ${effectedPortfolio.account_label} — ${effectedPortfolio.snapshot_date}`);
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
