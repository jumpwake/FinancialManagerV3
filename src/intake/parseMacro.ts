import { z } from "zod";

export const MacroContextSchema = z.object({
  snapshot_date: z.string().min(1),
  federal_funds_rate: z.number(),
  cpi_yoy_headline: z.number(),
  cpi_yoy_core: z.number(),
  yield_curve_spread_10y_2y: z.number(),
  yield_curve_status: z.string(),
  vix: z.number().nonnegative(),
  hy_credit_spread_oas_bps: z.number().nonnegative(),
  lei_consecutive_declines: z.number().int().nonnegative(),
  ism_manufacturing: z.number(),
  ism_services: z.number(),
  market_regime: z.string(),
  sector_overweight: z.array(z.string()),
  sector_underweight: z.array(z.string()),
});

export type MacroContext = z.infer<typeof MacroContextSchema>;

export function parseMacro(input: unknown): MacroContext {
  return MacroContextSchema.parse(input);
}
