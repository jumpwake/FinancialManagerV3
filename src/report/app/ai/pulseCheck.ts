import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Situation,
  PulseVerdict,
  Portfolio,
  MacroContext,
  Flag,
  MacroSnapshot,
} from "../types";

const PulseVerdictSchema = z.object({
  verdict: z
    .enum(["deploy", "partial_deploy", "hold", "monitor"])
    .describe("Current-conditions verdict on the situation."),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("Confidence in the verdict given the signal clarity."),
  rationale: z
    .string()
    .describe(
      "2-4 sentences citing actual indicator values (VIX X.X, yield curve X.XX%, regime). Colleague-to-colleague CFA tone.",
    ),
  suggested_action: z
    .string()
    .describe("One sentence with a concrete next step. Specific, not 'consider rebalancing'."),
  reconsider_when: z
    .string()
    .nullable()
    .describe("Optional threshold that would change the verdict (e.g., 'if VIX > 25 or curve inverts'). Null if no clear threshold."),
});

const SYSTEM_PROMPT = `You are a CFA-trained portfolio advisor evaluating an open user situation about an ongoing deployment, rebalance, or strategic decision. You read current macro signals through a contrarian lens:
- Calm markets / low VIX / euphoric sentiment → caution on deployments
- Fear / elevated VIX / negative sentiment → opportunity for deployment
- Late-cycle / recession risk → favor defensive tranches (FI, staples) over growth

Output a verdict tied to current conditions, NOT a generic recommendation. Reference specific indicators by value. Be willing to say "monitor" if signals are mixed.

STYLE:
- 2-4 sentences for rationale; cite actual values ("VIX at 18.2", not "calm")
- Concrete suggested_action — what to do this week, not "consider rebalancing"
- Use Unicode minus (−) for negatives, never ASCII -
- Tone: colleague-to-colleague, no hedging language
- No words "robust" or "optimize"`.trim();

export interface PulseInput {
  situation: Situation;
  macro: MacroContext;
  portfolio: Portfolio;
  related_flags: Flag[];
}

export function renderPulseInput(input: PulseInput): string {
  return JSON.stringify(
    {
      situation: {
        title: input.situation.title,
        intent: input.situation.intent,
        target_date: input.situation.target_date,
        portfolio_effects: input.situation.portfolio_effects,
        prior_verdicts: input.situation.verdict_history.slice(-3).map(v => ({
          run_at: v.run_at,
          verdict: v.verdict,
          rationale: v.rationale,
        })),
      },
      macro: {
        regime: input.macro.market_regime,
        vix: input.macro.vix,
        yield_curve_spread_10y_2y: input.macro.yield_curve_spread_10y_2y,
        yield_curve_status: input.macro.yield_curve_status,
        federal_funds_rate: input.macro.federal_funds_rate,
        cpi_yoy_core: input.macro.cpi_yoy_core,
        hy_credit_spread_oas_bps: input.macro.hy_credit_spread_oas_bps,
        lei_consecutive_declines: input.macro.lei_consecutive_declines,
      },
      portfolio_snapshot: {
        snapshot_date: input.portfolio.snapshot_date,
        holding_count: input.portfolio.holdings.length,
        total_value: input.portfolio.holdings.reduce((s, h) => s + h.market_value, 0),
      },
      related_flags: input.related_flags.map(f => ({
        title: f.title,
        body: f.body,
      })),
    },
    null,
    2,
  );
}

export function macroSnapshotFor(macro: MacroContext): MacroSnapshot {
  return {
    regime: macro.market_regime,
    vix: macro.vix,
    yield_curve_10y_2y: macro.yield_curve_spread_10y_2y,
    hy_credit_spread_oas_bps: macro.hy_credit_spread_oas_bps,
    lei_consecutive_declines: macro.lei_consecutive_declines,
  };
}

export async function runPulseCheck(input: PulseInput, client: Anthropic): Promise<PulseVerdict> {
  const userContent = renderPulseInput(input);

  const response = await client.messages.parse({
    model:
      process.env.CLAUDE_MODEL_PULSE ??
      process.env.CLAUDE_MODEL ??
      "claude-opus-4-7",
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(PulseVerdictSchema as never),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (!response.parsed_output) {
    throw new Error("Anthropic API returned no parsed_output for pulse-check");
  }

  const parsed = response.parsed_output as {
    verdict: PulseVerdict["verdict"];
    confidence: PulseVerdict["confidence"];
    rationale: string;
    suggested_action: string;
    reconsider_when: string | null;
  };
  return {
    run_at: new Date().toISOString(),
    macro_snapshot: macroSnapshotFor(input.macro),
    ...parsed,
  };
}
