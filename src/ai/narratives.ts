import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type {
  AINarratives,
  Portfolio,
  MacroContext,
  PortfolioAggregates,
  DimensionScore,
  ReferenceModel,
  Flag,
} from "../types";

const AINarrativesSchema = z.object({
  headline_summary: z
    .string()
    .describe(
      "2-3 sentences. Plain language. Mention the current grade, strongest dimension, and the #1 gap.",
    ),
  benchmark_context: z
    .string()
    .describe(
      "2 sentences. How does this portfolio compare to the 3 reference models and why?",
    ),
  strengths: z
    .array(z.string())
    .length(3)
    .describe("3 strengths, each 1-2 sentences."),
  gaps: z
    .array(z.string())
    .length(3)
    .describe("3 gaps. Specific and actionable. Reference actual values."),
  additional_takeaways: z
    .array(z.string())
    .length(3)
    .describe(
      "3 observations about overlap, macro timing, or positioning nuance. Each 1-2 sentences.",
    ),
  phase1_macro_note: z
    .string()
    .describe(
      "1-2 sentences. Reference specific macro indicators (VIX, yield curve, LEI). What does the current regime mean for the immediate action items?",
    ),
});

const SYSTEM_PROMPT = `You are a portfolio health analyst generating a comparative assessment for an investor dashboard. You receive structured portfolio data including computed dimension scores and macro context.

Rules:
- Use actual values from the data (e.g., "25.4% cash" not "high cash")
- Grades use Unicode minus: "B−" not "B-"
- No vague language: not "consider rebalancing", not "may want to look at"
- No words "robust" or "optimize"
- Tone: direct, like a CFA reading a portfolio to a colleague
- Each gap must reference specific values from the data and propose specific actions
- Each strength must reference specific tickers or values that make it true
- Additional takeaways should surface non-obvious insights (overlap analysis, macro-timing nuance, sector positioning)
- The phase1 macro note must cite specific macro indicators from the input data`.trim();

export interface NarrativesInput {
  portfolio: Portfolio;
  macro: MacroContext;
  aggregates: PortfolioAggregates;
  portfolio_score: number;
  portfolio_grade: string;
  dimension_scores: DimensionScore[];
  reference_models: ReferenceModel[];
  flags: Flag[];
}

export async function generateNarratives(
  input: NarrativesInput,
): Promise<AINarratives> {
  const client = new Anthropic();

  const userContent = JSON.stringify({
    snapshot_date: input.portfolio.snapshot_date,
    portfolio_grade: input.portfolio_grade,
    portfolio_score: input.portfolio_score,
    aggregates: input.aggregates,
    dimension_scores: input.dimension_scores,
    reference_models: input.reference_models.map((m) => ({
      label: m.label,
      grade: m.grade,
      score: m.score,
    })),
    macro: input.macro,
    flags: input.flags,
  });

  const response = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(AINarrativesSchema),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  if (!response.parsed_output) {
    throw new Error("Anthropic API returned no parsed_output");
  }
  return response.parsed_output;
}
