import type { UnderlyingComposition } from "../types";

/**
 * Vanguard-style glide path approximation.
 *
 * Pre-target: equity rises linearly from 50% at target to 90% (capped) at ~14y+.
 * Slope is calibrated so 14 years out = ~80% equity (Vanguard 2040-fund norm).
 * Post-target: equity falls linearly from 50% at target to 30% floor at 11y past.
 * Cash steps to 5% at target date and grows slowly (~0.2%/yr) thereafter.
 * International equity is always 25% of the equity portion (Vanguard target-date norm).
 */
export function glidePathComposition(
  target_year: number,
  current_year: number,
): UnderlyingComposition {
  const years = target_year - current_year;

  // Equity glide — slope pre-target: reaches 0.80 at 14y, caps at 0.90
  // slope = (0.80 - 0.50) / 14 ≈ 0.02143/yr
  const PRE_TARGET_SLOPE = 0.30 / 14;
  // Post-target slope: 0.50 → 0.30 over 11 years
  const POST_TARGET_SLOPE = 0.20 / 11;

  let equity: number;
  if (years >= 0) {
    equity = Math.min(0.90, 0.50 + years * PRE_TARGET_SLOPE);
  } else {
    equity = Math.max(0.30, 0.50 + years * POST_TARGET_SLOPE);
  }

  const intl = equity * 0.25;
  const us_equity = equity - intl;

  // Cash steps to 5% at target date, grows at 0.2%/yr thereafter (capped at 10%)
  let cash = 0;
  if (years <= 0) cash = Math.min(0.10, 0.05 + 0.002 * (-years));

  const fixed_income = Math.max(0, 1 - us_equity - intl - cash);

  return {
    us_equity,
    international_equity: intl,
    fixed_income,
    cash,
  };
}

const TARGET_YEAR_RE = /\b(20\d{2})\b/;

export function extractTargetYear(label: string): number | null {
  const m = label.match(TARGET_YEAR_RE);
  if (!m) return null;
  const y = Number(m[1]);
  if (y < 2000 || y > 2100) return null;
  return y;
}
