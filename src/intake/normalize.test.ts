import { describe, test, expect } from "vitest";
import { parseMoneyString, normalizeFidelityAccounts, normalizeEmpowerAccounts, normalizeVanguardAccounts } from "./normalize";
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
    const holdings = normalizeFidelityAccounts(raw);
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
    const holdings = normalizeFidelityAccounts(raw);
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
    const holdings = normalizeFidelityAccounts(raw);
    expect(holdings[0].ticker).toBe("FSKAX");
    expect(holdings[0].label).toBe("FIDELITY TOTAL MARKET INDEX FUND");
  });

  test("loads and normalizes the real Fidelity sample file", () => {
    const raw = JSON.parse(fs.readFileSync(path.resolve("data/SamplePortfolio/20260509_FidelityRetirement.json"), "utf-8"));
    const holdings = normalizeFidelityAccounts(raw);
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
    const holdings = normalizeFidelityAccounts(raw);
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
    const holdings = normalizeEmpowerAccounts(raw);
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
    expect(normalizeEmpowerAccounts(raw)[0].asset_class).toBe("target_date");
  });

  test("loads the real Empower sample file", () => {
    const raw = JSON.parse(require("fs").readFileSync(require("path").resolve("data/SamplePortfolio/20260509_EmpowerKelly.json"), "utf-8"));
    const holdings = normalizeEmpowerAccounts(raw);
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
    const holdings = normalizeVanguardAccounts(raw);
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
    const holdings = normalizeVanguardAccounts(raw);
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
    const holdings = normalizeVanguardAccounts(raw);
    const stockHoldings = holdings.filter(h => !h.is_cash);
    expect(stockHoldings).toHaveLength(1);
    expect(stockHoldings[0].ticker).toBe("BRK-B");
    expect(stockHoldings[0].asset_class).toBe("individual_stock");
  });

  test("loads the real VanguardBusiness sample file", () => {
    const raw = JSON.parse(require("fs").readFileSync(require("path").resolve("data/SamplePortfolio/20260509_VanguardBusiness.json"), "utf-8"));
    const holdings = normalizeVanguardAccounts(raw);
    // 3 holdings (VFSUX, QQQ, NVDA) + 1 settlement_fund cash
    expect(holdings).toHaveLength(4);
    expect(holdings.filter(h => h.is_cash)).toHaveLength(1);
    expect(holdings.find(h => h.ticker === "VFSUX")?.asset_class).toBe("us_bond_short");
  });

  test("skips empty holdings arrays + zero settlement_fund", () => {
    const raw = [
      { account_number: "X", holdings: [], settlement_fund: "$0.00" },
    ];
    expect(normalizeVanguardAccounts(raw)).toEqual([]);
  });
});
