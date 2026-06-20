import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  Portfolio,
  MacroContext,
  PortfolioAggregates,
  DimensionScore,
  Flag,
  GapItem,
  AccountConfig,
  Situation,
  TacticalAdvisorOutput,
  UserProfile,
  SpeculativeHold,
} from "../types";
import { ADVISOR_PERSONA } from "../report/app/ai/advisorPersona";

const SYSTEM_PROMPT = `${ADVISOR_PERSONA}

TASK:
Produce ONE structured output object with:
- deployment_recommendation: present ONLY if the user has pending_cash_value > 0; recommend specific dollar moves into specific account labels with rationale tied to score gaps + macro.
- tactical_plan: 0-3 moves in the next 7 days + 0-3 moves in the next 30 days + 2-3 scenario_resilience_notes.

Every move must cite (a) specific dollars, (b) target account by label, (c) which scenarios it addresses, (d) which dimension scores it lifts.

SPECULATIVE SLEEVE: The input includes a "speculative_holds" array — tickers the user holds deliberately, for personal/long-term reasons, OUTSIDE the metrics discipline. Do NOT recommend trimming, selling, rebalancing, or reducing these positions on valuation, beta, growth, or single-stock-risk grounds. Treat them as fixed. You MAY reference the sleeve only if a flag with finding_key "speculative_sleeve:over_threshold" is present, in which case you may note the sleeve has grown beyond its size budget.`.trim();

const moveSchema = z.object({
  id: z.string(),
  category: z.enum(["deploy_cash", "rebalance", "trim", "asset_location_swap", "scenario_hedge", "tax_loss_harvest"]),
  action: z.string(),
  target_account: z.string(),
  dollars: z.number(),
  rationale: z.string(),
  scenarios_addressed: z.array(z.string()),
  expected_score_delta: z.number().optional(),
});

const outputSchema = z.object({
  deployment_recommendation: z.object({
    summary: z.string(),
    moves: z.array(z.object({
      id: z.string(),
      ticker: z.string(),
      dollars: z.number(),
      target_account: z.string(),
      rationale: z.string(),
    })),
    projected_grade: z.string(),
    projected_dimension_deltas: z.record(z.string(), z.number()),
  }).nullable(),
  tactical_plan: z.object({
    summary: z.string(),
    target_grade: z.string(),
    next_7_days: z.array(moveSchema),
    next_30_days: z.array(moveSchema),
    scenario_resilience_notes: z.array(z.string()),
  }),
});

export interface TacticalInputContext {
  portfolio: Portfolio;
  aggregates: PortfolioAggregates;
  macro: MacroContext;
  dimension_scores: DimensionScore[];
  portfolio_score: number;
  portfolio_grade: string;
  flags: Flag[];
  gap_items: GapItem[];
  accounts: AccountConfig;
  open_situations: Situation[];
  profile?: UserProfile | null;
  speculative_holds?: SpeculativeHold[];
}

export function renderTacticalInput(ctx: TacticalInputContext): string {
  return JSON.stringify(
    {
      portfolio: ctx.portfolio,
      aggregates: ctx.aggregates,
      macro: ctx.macro,
      dimension_scores: ctx.dimension_scores,
      portfolio_score: ctx.portfolio_score,
      portfolio_grade: ctx.portfolio_grade,
      flags: ctx.flags,
      gap_items: ctx.gap_items,
      accounts: ctx.accounts,
      open_situations: ctx.open_situations.filter(s => s.status === "open"),
      profile: ctx.profile ?? null,
      speculative_holds: ctx.speculative_holds ?? [],
    },
    null,
    2,
  );
}

// The model occasionally emits a structured-output value that violates the Zod
// schema (e.g. a move `category` outside the allowed enum), which makes
// messages.parse() throw. It's an intermittent sampling artifact — a fresh call
// almost always validates — so retry a few times before giving up. After the
// last attempt the original error propagates, preserving the caller's
// degrade-to-null behavior in src/index.ts.
const ADVISOR_PARSE_ATTEMPTS = 3;

export async function runTacticalAdvisor(ctx: TacticalInputContext): Promise<TacticalAdvisorOutput> {
  const client = new Anthropic();
  let lastErr: unknown;

  for (let attempt = 1; attempt <= ADVISOR_PARSE_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.parse({
        model:
          process.env.CLAUDE_MODEL_ADVISOR ??
          process.env.CLAUDE_MODEL ??
          "claude-opus-4-7",
        max_tokens: 16000,
        output_config: {
          effort: "medium",
          // SDK 0.95's zodOutputFormat .d.ts still types its argument as zod v3
          // (ZodType), but its .mjs imports from "zod/v4" and only accepts v4
          // schemas at runtime. We construct a v4 schema (correct for runtime);
          // the cast bridges the stale types until the SDK ships v4-typed defs.
          format: zodOutputFormat(outputSchema as never),
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: renderTacticalInput(ctx) }],
      });

      if (!response.parsed_output) {
        throw new Error("Anthropic API returned no parsed_output");
      }
      return response.parsed_output as TacticalAdvisorOutput;
    } catch (err) {
      lastErr = err;
      if (attempt < ADVISOR_PARSE_ATTEMPTS) {
        console.warn(
          `  Tactical advisor attempt ${attempt}/${ADVISOR_PARSE_ATTEMPTS} failed (${err instanceof Error ? err.message.split("\n")[0] : err}); retrying...`,
        );
      }
    }
  }

  throw lastErr;
}
