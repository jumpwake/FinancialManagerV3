import type { Portfolio, Holding, Situation, PortfolioEffect } from "../types";

function cloneHolding(h: Holding): Holding {
  return JSON.parse(JSON.stringify(h));
}

function applyMarkCashPending(
  holdings: Holding[],
  effect: Extract<PortfolioEffect, { type: "mark_cash_pending" }>,
): Holding[] {
  // Undefined amount → mark ALL idle cash as pending (no remainder, no split).
  if (effect.amount_usd === undefined) {
    return holdings.map((h) => {
      if (!h.is_cash || h.is_pending_deployment) return cloneHolding(h);
      const updated = cloneHolding(h);
      updated.is_pending_deployment = true;
      updated.asset_class = "cash_pending";
      if (effect.deployment_label) updated.deployment_label = effect.deployment_label;
      return updated;
    });
  }

  const result: Holding[] = [];
  let remaining = effect.amount_usd;

  for (const h of holdings) {
    if (!h.is_cash || h.is_pending_deployment || remaining <= 0) {
      result.push(cloneHolding(h));
      continue;
    }
    if (h.market_value <= remaining) {
      const updated = cloneHolding(h);
      updated.is_pending_deployment = true;
      updated.asset_class = "cash_pending";
      if (effect.deployment_label) updated.deployment_label = effect.deployment_label;
      result.push(updated);
      remaining -= h.market_value;
    } else {
      const pending = cloneHolding(h);
      pending.market_value = remaining;
      pending.is_pending_deployment = true;
      pending.asset_class = "cash_pending";
      pending.ticker = `${h.ticker}_pending`;
      pending.label = `${h.label} (pending)`;
      if (effect.deployment_label) pending.deployment_label = effect.deployment_label;
      result.push(pending);

      const idle = cloneHolding(h);
      idle.market_value = h.market_value - remaining;
      result.push(idle);
      remaining = 0;
    }
  }
  return result;
}

function applyMarkHoldingPending(
  holdings: Holding[],
  effect: Extract<PortfolioEffect, { type: "mark_holding_pending" }>,
): Holding[] {
  return holdings.map((h) => {
    if (h.ticker !== effect.ticker) return cloneHolding(h);
    const updated = cloneHolding(h);
    updated.is_pending_deployment = true;
    return updated;
  });
}

export function applyPortfolioEffects(
  portfolio: Portfolio,
  situations: Situation[],
): Portfolio {
  let holdings = portfolio.holdings.map(cloneHolding);
  for (const sit of situations) {
    if (sit.status !== "open") continue;
    for (const effect of sit.portfolio_effects) {
      if (effect.type === "mark_cash_pending") {
        holdings = applyMarkCashPending(holdings, effect);
      } else if (effect.type === "mark_holding_pending") {
        holdings = applyMarkHoldingPending(holdings, effect);
      }
    }
  }
  return { ...portfolio, holdings };
}
