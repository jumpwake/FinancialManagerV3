import { describe, test, it, expect } from "vitest";
import { parseMoneyString, normalizeFidelityAccounts, normalizeEmpowerAccounts, normalizeVanguardAccounts, consolidatePortfolio } from "./normalize";
import { parsePortfolio } from "./parsePortfolio";
import { computeAggregates } from "../engine/aggregates";
import { Holding } from "../types";
import * as fs from "node:fs";
import * as path from "node:path";

describe("parseMoneyString", () => {
  test("parses dollar-prefixed string with commas", () => {
    expect(parseMoneyString("$642,296.45")).toBeCloseTo(642296.45, 2);
  });
  test("parses small values without commas", () => {
    expect(parseMoneyString("$5,000.00")).toBe(5000);
  });
  test("parses negative values", () => {
    expect(parseMoneyString("-$1,234.56")).toBeCloseTo(-1234.56, 2);
  });
  test("returns 0 for empty string", () => {
    expect(parseMoneyString("")).toBe(0);
  });
  test("returns 0 for null/undefined", () => {
    expect(parseMoneyString(null as any)).toBe(0);
    expect(parseMoneyString(undefined as any)).toBe(0);
  });
});

describe("normalizeFidelityAccounts", () => {
  test("flattens accounts into a single holdings array", () => {
    const raw = [
      {
        account_id: "A1",
        account_name: "Kelly401k",
        account_label: "BIS Kelly 401k",
        total_value: "$1,000.00",
        holdings: [
          { symbol: "FSKAX", description: "Fidelity Total Market", quantity: "10", balance: "$600.00" },
          { symbol: "FTIHX", description: "Fidelity International", quantity: "20", balance: "$400.00" },
        ],
      },
    ];
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings).toHaveLength(2);
    const fskax = holdings.find(h => h.ticker === "FSKAX")!;
    expect(fskax.market_value).toBe(600);
    expect(fskax.asset_class).toBe("us_equity_total_market");
    expect(fskax.expense_ratio).toBe(0.00015);
    expect(fskax.is_cash).toBe(false);
  });

  test("marks 'Cash' rows as cash holdings", () => {
    const raw = [
      {
        account_id: "A1", account_name: "Test", account_label: "", total_value: "$100",
        holdings: [
          { symbol: "Cash", description: "HELD IN MONEY MARKET", quantity: "", balance: "$100.00" },
        ],
      },
    ];
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings).toHaveLength(1);
    const cash = holdings[0];
    expect(cash.is_cash).toBe(true);
    expect(cash.asset_class).toBe("cash");
    expect(cash.market_value).toBe(100);
    expect(cash.expense_ratio).toBeNull();
  });

  test("uses description as label, ticker as canonical symbol", () => {
    const raw = [
      {
        account_id: "A1", account_name: "Test", account_label: "", total_value: "$100",
        holdings: [
          { symbol: "FSKAX", description: "FIDELITY TOTAL MARKET INDEX FUND", quantity: "5", balance: "$100.00" },
        ],
      },
    ];
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings[0].ticker).toBe("FSKAX");
    expect(holdings[0].label).toBe("FIDELITY TOTAL MARKET INDEX FUND");
  });

  test("loads and normalizes the real Fidelity sample file", () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/SamplePortfolio/20260509_FidelityRetirement.json"), "utf-8"));
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings.length).toBeGreaterThan(0);
    // Should include FSKAX from Kelly401k and from Kevin401k (2 separate holdings — Task 25 will dedupe)
    const fskaxHoldings = holdings.filter(h => h.ticker === "FSKAX");
    expect(fskaxHoldings).toHaveLength(2);
    // Should include cash holdings from each account
    expect(holdings.filter(h => h.is_cash).length).toBeGreaterThanOrEqual(2);
    // All tickers should be from the known metadata or "Cash"
    const knownOrCash = (h: any) => h.is_cash || ["FSKAX","FTIHX","FXNAX","XLU","XLV","XLI","XLP"].includes(h.ticker);
    expect(holdings.every(knownOrCash)).toBe(true);
  });

  test("sets sector_tag when ticker has one (XLU → utilities)", () => {
    const raw = [
      {
        account_id: "A1", account_name: "Test", account_label: "", total_value: "$100",
        holdings: [
          { symbol: "XLU", description: "Utilities ETF", quantity: "1", balance: "$100.00" },
        ],
      },
    ];
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings[0].sector_tag).toBe("utilities");
  });
});

describe("normalizeEmpowerAccounts", () => {
  test("handles descriptive symbols (no real ticker)", () => {
    const raw = [
      {
        account_name: "EmpowerTest",
        holdings: [
          { symbol: "US Large Company Stocks Fund", balance: "$258,681.46", quantity: "11,259.45" },
        ],
      },
    ];
    const holdings = normalizeEmpowerAccounts(raw, "acct_a");
    expect(holdings).toHaveLength(1);
    const h = holdings[0];
    expect(h.market_value).toBeCloseTo(258681.46, 2);
    expect(h.asset_class).toBe("us_equity_large_cap");
    expect(h.label).toBe("US Large Company Stocks Fund");
    expect(h.is_cash).toBe(false);
  });

  test("maps Target Retirement to target_date asset class", () => {
    const raw = [
      {
        account_name: "Test",
        holdings: [{ symbol: "Target Retirement 2040 Fund", balance: "$31,790.66", quantity: "393" }],
      },
    ];
    expect(normalizeEmpowerAccounts(raw, "acct_a")[0].asset_class).toBe("target_date");
  });

  test("loads the real Empower sample file", () => {
    const raw = JSON.parse(require("fs").readFileSync(require("path").resolve("data/SamplePortfolio/20260509_EmpowerKelly.json"), "utf-8"));
    const holdings = normalizeEmpowerAccounts(raw, "acct_a");
    expect(holdings).toHaveLength(3);
    expect(holdings.every(h => h.market_value > 0)).toBe(true);
    const labels = holdings.map(h => h.label).sort();
    expect(labels).toContain("US Large Company Stocks Fund");
    expect(labels).toContain("US Small/Mid Company Stocks Fund");
    expect(labels).toContain("Target Retirement 2040 Fund");
  });
});

describe("normalizeVanguardAccounts", () => {
  test("emits cash holding from settlement_fund", () => {
    const raw = [
      {
        account_number: "12345",
        holdings: [],
        settlement_fund: "$5,000.00",
      },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    expect(holdings).toHaveLength(1);
    expect(holdings[0].is_cash).toBe(true);
    expect(holdings[0].asset_class).toBe("cash");
    expect(holdings[0].market_value).toBe(5000);
  });

  test("flattens regular holdings with metadata lookup", () => {
    const raw = [
      {
        account_number: "12345",
        holdings: [
          { symbol: "VTSAX", quantity: "100", balance: "$15,000.00" },
          { symbol: "NVDA", quantity: "50", balance: "$10,000.00" },
        ],
        settlement_fund: "$0.00",
      },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    // Two holdings + the settlement_fund (which is $0 so should be skipped)
    expect(holdings).toHaveLength(2);
    const vtsax = holdings.find(h => h.ticker === "VTSAX")!;
    expect(vtsax.market_value).toBe(15000);
    expect(vtsax.asset_class).toBe("us_equity_total_market");
    const nvda = holdings.find(h => h.ticker === "NVDA")!;
    expect(nvda.asset_class).toBe("individual_stock");
  });

  test("normalizes 'BRK B' to canonical 'BRK-B'", () => {
    const raw = [
      {
        account_number: "12345",
        holdings: [{ symbol: "BRK B", quantity: "10", balance: "$5,000.00" }],
        settlement_fund: "$0.00",
      },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    const stockHoldings = holdings.filter(h => !h.is_cash);
    expect(stockHoldings).toHaveLength(1);
    expect(stockHoldings[0].ticker).toBe("BRK-B");
    expect(stockHoldings[0].asset_class).toBe("individual_stock");
  });

  test("loads the real VanguardBusiness sample file", () => {
    const raw = JSON.parse(require("fs").readFileSync(require("path").resolve("data/SamplePortfolio/20260509_VanguardBusiness.json"), "utf-8"));
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    // 3 holdings (VFSUX, QQQ, NVDA) + 1 settlement_fund cash
    expect(holdings).toHaveLength(4);
    expect(holdings.filter(h => h.is_cash)).toHaveLength(1);
    expect(holdings.find(h => h.ticker === "VFSUX")?.asset_class).toBe("us_bond_short");
  });

  test("skips empty holdings arrays + zero settlement_fund", () => {
    const raw = [
      { account_number: "X", holdings: [], settlement_fund: "$0.00" },
    ];
    expect(normalizeVanguardAccounts(raw, "acct_a")).toEqual([]);
  });
});

describe("consolidatePortfolio", () => {
  test("merges duplicate tickers by summing market_values", () => {
    const holdings: Holding[] = [
      { ticker: "FSKAX", label: "F", market_value: 100, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
      { ticker: "FSKAX", label: "F", market_value: 250, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 },
      { ticker: "FTIHX", label: "X", market_value: 50, asset_class: "international_equity", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00006 },
    ];
    const portfolio = consolidatePortfolio(holdings, "2026-05-09", "Combined");
    const fskax = portfolio.holdings.find(h => h.ticker === "FSKAX")!;
    expect(fskax.market_value).toBe(350);
    expect(portfolio.holdings).toHaveLength(2);
  });

  test("aggregates all cash holdings into a single Cash entry", () => {
    const holdings: Holding[] = [
      { ticker: "Cash", label: "Fidelity MM", market_value: 100, asset_class: "cash", account_id: "acct_a", is_cash: true, is_pending_deployment: false, expense_ratio: null },
      { ticker: "Cash", label: "Vanguard settlement", market_value: 200, asset_class: "cash", account_id: "acct_a", is_cash: true, is_pending_deployment: false, expense_ratio: null },
    ];
    const portfolio = consolidatePortfolio(holdings, "2026-05-09", "Test");
    expect(portfolio.holdings).toHaveLength(1);
    expect(portfolio.holdings[0].ticker).toBe("Cash");
    expect(portfolio.holdings[0].market_value).toBe(300);
    expect(portfolio.holdings[0].is_cash).toBe(true);
  });

  test("preserves snapshot_date and account_label", () => {
    const portfolio = consolidatePortfolio(
      [{ ticker: "FSKAX", label: "F", market_value: 100, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.00015 }],
      "2026-05-09",
      "My Combined Portfolio"
    );
    expect(portfolio.snapshot_date).toBe("2026-05-09");
    expect(portfolio.account_label).toBe("My Combined Portfolio");
  });

  test("sorts holdings by market_value descending", () => {
    const holdings: Holding[] = [
      { ticker: "B", label: "B", market_value: 100, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.0001 },
      { ticker: "A", label: "A", market_value: 500, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.0001 },
      { ticker: "C", label: "C", market_value: 200, asset_class: "us_equity_total_market", account_id: "acct_a", is_cash: false, is_pending_deployment: false, expense_ratio: 0.0001 },
    ];
    const portfolio = consolidatePortfolio(holdings, "2026-05-09", "Test");
    expect(portfolio.holdings.map(h => h.ticker)).toEqual(["A", "C", "B"]);
  });
});

describe("stock_metrics attachment", () => {
  test("Vanguard NVDA holding has stock_metrics populated from tickerMetadata", () => {
    const raw = [
      { account_number: "X", holdings: [{ symbol: "NVDA", quantity: "100", balance: "$10,000.00" }], settlement_fund: "$0" },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    const nvda = holdings.find(h => h.ticker === "NVDA")!;
    expect(nvda.stock_metrics).toBeDefined();
    expect(nvda.stock_metrics!.pe_ratio).toBeCloseTo(44.74, 2);
    expect(nvda.stock_metrics!.beta).toBeCloseTo(2.244, 3);
  });

  test("Vanguard TSLA holding has stock_metrics populated (extreme valuation)", () => {
    const raw = [
      { account_number: "X", holdings: [{ symbol: "TSLA", quantity: "100", balance: "$10,000.00" }], settlement_fund: "$0" },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    const tsla = holdings.find(h => h.ticker === "TSLA")!;
    expect(tsla.stock_metrics).toBeDefined();
    expect(tsla.stock_metrics!.pe_ratio).toBeCloseTo(410.29, 2);
    expect(tsla.stock_metrics!.eps_growth_yoy).toBeCloseTo(-0.4702, 4);
  });

  test("Vanguard BRK B (with space) gets BRK-B stock_metrics via canonicalTicker", () => {
    const raw = [
      { account_number: "X", holdings: [{ symbol: "BRK B", quantity: "10", balance: "$5,000.00" }], settlement_fund: "$0" },
    ];
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    const brk = holdings.find(h => h.ticker === "BRK-B")!;
    expect(brk.stock_metrics).toBeDefined();
    expect(brk.stock_metrics!.pe_ratio).toBeCloseTo(26.12, 2);
  });

  test("Fidelity holdings without stock_metrics (e.g. FSKAX) leave the field undefined", () => {
    const raw = [
      {
        account_id: "A", account_name: "Test", account_label: "", total_value: "$1000",
        holdings: [{ symbol: "FSKAX", description: "Fidelity Total Market", quantity: "5", balance: "$1000.00" }],
      },
    ];
    const holdings = normalizeFidelityAccounts(raw, "acct_a");
    expect(holdings[0].stock_metrics).toBeUndefined();
  });

  test("end-to-end: TSLA in real Vanguard Personal file gets flagged by scoreSingleStockRisk", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { computeAggregates } = await import("../engine/aggregates");
    const { scoreSingleStockRisk } = await import("../engine/dimensions");

    const raw = JSON.parse(fs.readFileSync(path.resolve("data/SamplePortfolio/20260509_VanguardPersonal.json"), "utf-8"));
    const holdings = normalizeVanguardAccounts(raw, "acct_a");
    // Build a portfolio that's mostly TSLA so the penalty shows clearly
    const portfolio = consolidatePortfolio(holdings, "2026-05-09", "Test");
    const agg = computeAggregates(portfolio);
    const score = scoreSingleStockRisk(portfolio, agg);
    // TSLA's P/E 410 + declining EPS + high beta + declining revenue should drag the score well below 10
    expect(score.score).toBeLessThan(10);
    expect(score.display_value).toContain("TSLA");
  });
});

describe("normalize attaches account_id", () => {
  it("Fidelity holdings carry the account_id passed in", () => {
    const result = normalizeFidelityAccounts(
      [
        {
          account_id: "raw_fid",
          account_name: "Fidelity Retirement",
          account_label: "Fidelity",
          total_value: "$1000",
          holdings: [
            { symbol: "FSKAX", description: "Total Mkt", quantity: "10", balance: "$1,000" },
          ],
        },
      ],
      "fidelity_retirement",
    );
    expect(result[0].account_id).toBe("fidelity_retirement");
  });

  it("Vanguard settlement cash carries the account_id", () => {
    const result = normalizeVanguardAccounts(
      [
        {
          account_number: "X123",
          settlement_fund: "$500",
          holdings: [],
        },
      ],
      "vanguard_personal",
    );
    expect(result[0].account_id).toBe("vanguard_personal");
    expect(result[0].is_cash).toBe(true);
  });
});

describe("normalize attaches underlying_composition", () => {
  it("VWENX gets composition from tickerMetadata", () => {
    const result = normalizeVanguardAccounts(
      [{
        account_number: "X",
        settlement_fund: "$0",
        holdings: [{ symbol: "VWENX", quantity: "100", balance: "$10,000" }],
      }],
      "vanguard_personal",
    );
    expect(result[0].underlying_composition).toBeDefined();
    expect(result[0].underlying_composition!.us_equity).toBeCloseTo(0.60, 2);
    expect(result[0].underlying_composition!.fixed_income).toBeCloseTo(0.35, 2);
  });

  it("a target-date fund gets composition from the glide path helper", () => {
    const result = normalizeVanguardAccounts(
      [{
        account_number: "X",
        settlement_fund: "$0",
        holdings: [{ symbol: "VFORX", quantity: "100", balance: "$10,000" }],
      }],
      "vanguard_personal",
    );
    expect(result[0].underlying_composition).toBeDefined();
    // 2040 fund today (2026): glide path → ~80% equity (us + intl)
    const c = result[0].underlying_composition!;
    expect(c.us_equity + c.international_equity).toBeCloseTo(0.80, 1);
  });

  it("a regular total-market fund (FSKAX) gets no composition", () => {
    const result = normalizeFidelityAccounts(
      [{
        account_id: "X",
        account_name: "X",
        account_label: "X",
        total_value: "$1",
        holdings: [{ symbol: "FSKAX", description: "Total Market", quantity: "1", balance: "$1,000" }],
      }],
      "fidelity_retirement",
    );
    expect(result[0].underlying_composition).toBeUndefined();
  });
});

describe("end-to-end normalization", () => {
  test("all 5 sample files normalize, consolidate, validate, and aggregate cleanly", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { normalizeFidelityAccounts, normalizeEmpowerAccounts, normalizeVanguardAccounts } = await import("./normalize");

    const load = (file: string) => JSON.parse(fs.readFileSync(path.resolve("data/SamplePortfolio", file), "utf-8"));

    const fidelityHoldings = normalizeFidelityAccounts(load("20260509_FidelityRetirement.json"), "acct_a");
    const empowerHoldings  = normalizeEmpowerAccounts(load("20260509_EmpowerKelly.json"), "acct_a");
    const vbHoldings       = normalizeVanguardAccounts(load("20260509_VanguardBusiness.json"), "acct_a");
    const vkdbHoldings     = normalizeVanguardAccounts(load("20260509_VanguardKDB.json"), "acct_a");
    const vpHoldings       = normalizeVanguardAccounts(load("20260509_VanguardPersonal.json"), "acct_a");

    const all = [...fidelityHoldings, ...empowerHoldings, ...vbHoldings, ...vkdbHoldings, ...vpHoldings];
    const portfolio = consolidatePortfolio(all, "2026-05-09", "All Accounts");

    // Validates against zod schema
    const validated = parsePortfolio(portfolio);
    expect(validated.holdings.length).toBeGreaterThan(0);

    // Aggregates pipeline works end-to-end
    const agg = computeAggregates(validated);
    expect(agg.total_value).toBeGreaterThan(2_000_000); // total portfolio is ~$2.5M from the samples
    expect(agg.cash_weight).toBeGreaterThan(0);
    expect(agg.equity_weight).toBeGreaterThan(0);

    // FSKAX should be consolidated across both Fidelity 401k accounts
    const fskax = validated.holdings.find(h => h.ticker === "FSKAX");
    expect(fskax).toBeDefined();
    // Kelly401k FSKAX = $262,552.86 + Kevin401k FSKAX = $323,737.47 = $586,290.33
    expect(fskax!.market_value).toBeCloseTo(586290.33, 2);
  });
});
