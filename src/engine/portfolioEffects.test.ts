import { describe, it, expect } from "vitest";
import { applyPortfolioEffects } from "./portfolioEffects";
import { makePortfolio, makeHolding } from "../../tests/fixtures/samplePortfolio";
import type { Situation, PortfolioEffect } from "../types";

function makeSituation(effects: PortfolioEffect[]): Situation {
  return {
    id: "sit_test",
    title: "Test",
    intent: "Test",
    status: "open",
    target_date: null,
    related_findings: [],
    portfolio_effects: effects,
    verdict_history: [],
    created_at: "2026-05-12T00:00:00Z",
    updated_at: "2026-05-12T00:00:00Z",
    closed_at: null,
    closure_reason: null,
  };
}

describe("applyPortfolioEffects", () => {
  it("returns the portfolio unchanged when no situations have effects", () => {
    const portfolio = makePortfolio({
      holdings: [makeHolding({ ticker: "VTI", market_value: 100000 })],
    });
    const result = applyPortfolioEffects(portfolio, []);
    expect(result).toEqual(portfolio);
  });

  it("ignores closed situations", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const sit = { ...makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }]), status: "closed" as const };
    const result = applyPortfolioEffects(portfolio, [sit]);
    expect(result.holdings.find(h => h.ticker === "CASH")?.is_pending_deployment).toBe(false);
  });

  it("marks all cash as pending when amount_usd >= total cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "VTI", market_value: 100000 }),
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const sit = makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    const cashHoldings = result.holdings.filter(h => h.is_cash);
    expect(cashHoldings.every(h => h.is_pending_deployment)).toBe(true);
  });

  it("splits cash into pending + remainder when amount_usd < total cash", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const sit = makeSituation([
      { type: "mark_cash_pending", amount_usd: 120000, deployment_label: "T3" },
    ]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    const cashHoldings = result.holdings.filter(h => h.is_cash);
    expect(cashHoldings.length).toBe(2);
    const pending = cashHoldings.find(h => h.is_pending_deployment);
    const idle = cashHoldings.find(h => !h.is_pending_deployment);
    expect(pending?.market_value).toBe(120000);
    expect(pending?.deployment_label).toBe("T3");
    expect(idle?.market_value).toBe(80000);
  });

  it("marks a specific holding as pending by ticker", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "FXNAX", market_value: 50000, asset_class: "us_bond_aggregate", is_cash: false, is_pending_deployment: false }),
      ],
    });
    const sit = makeSituation([{ type: "mark_holding_pending", ticker: "FXNAX" }]);
    const result = applyPortfolioEffects(portfolio, [sit]);
    expect(result.holdings[0].is_pending_deployment).toBe(true);
  });

  it("does not mutate the input portfolio (pure)", () => {
    const portfolio = makePortfolio({
      holdings: [
        makeHolding({ ticker: "CASH", market_value: 200000, asset_class: "cash", is_cash: true, is_pending_deployment: false, expense_ratio: null }),
      ],
    });
    const before = JSON.parse(JSON.stringify(portfolio));
    applyPortfolioEffects(portfolio, [makeSituation([{ type: "mark_cash_pending", amount_usd: 200000 }])]);
    expect(portfolio).toEqual(before);
  });
});
