import { Holding, Portfolio } from "../types";
import { lookupTicker, canonicalTicker } from "./tickerMetadata";

/** Parse a dollar-formatted string like "$1,234.56" or "-$1,000.00" into a number. Returns 0 for empty/null/undefined. */
export function parseMoneyString(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

interface FidelityRawHolding {
  symbol: string;
  description: string;
  quantity: string;
  balance: string;
}

interface FidelityRawAccount {
  account_id: string;
  account_name: string;
  account_label: string;
  total_value: string;
  holdings: FidelityRawHolding[];
}

/** Flatten one or more Fidelity raw accounts into a single Holding[] (does NOT dedupe across accounts — see consolidatePortfolio in Task 25). */
export function normalizeFidelityAccounts(accounts: FidelityRawAccount[], account_id: string): Holding[] {
  const out: Holding[] = [];
  for (const account of accounts) {
    for (const raw of account.holdings) {
      const market_value = parseMoneyString(raw.balance);
      if (market_value <= 0) continue; // skip zero-value rows

      const isCashRow = raw.symbol === "Cash" || /money market/i.test(raw.description);
      if (isCashRow) {
        out.push({
          ticker: "Cash",
          label: raw.description || "Money Market",
          market_value,
          asset_class: "cash",
          account_id,
          is_cash: true,
          is_pending_deployment: false,
          expense_ratio: null,
        });
        continue;
      }

      const ticker = canonicalTicker(raw.symbol);
      const meta = lookupTicker(raw.symbol);
      out.push({
        ticker,
        label: raw.description || ticker,
        market_value,
        asset_class: meta?.asset_class ?? "us_equity_total_market",
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
      });
    }
  }
  return out;
}

interface EmpowerRawHolding {
  symbol: string;
  balance: string;
  quantity: string;
}

interface EmpowerRawAccount {
  account_name: string;
  holdings: EmpowerRawHolding[];
}

export function normalizeEmpowerAccounts(accounts: EmpowerRawAccount[], account_id: string): Holding[] {
  const out: Holding[] = [];
  for (const account of accounts) {
    for (const raw of account.holdings) {
      const market_value = parseMoneyString(raw.balance);
      if (market_value <= 0) continue;

      const meta = lookupTicker(raw.symbol);
      out.push({
        ticker: raw.symbol,
        label: raw.symbol,
        market_value,
        asset_class: meta?.asset_class ?? "us_equity_total_market",
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
      });
    }
  }
  return out;
}

interface VanguardRawHolding {
  symbol: string;
  quantity: string;
  balance: string;
}

interface VanguardRawAccount {
  account_number: string;
  holdings: VanguardRawHolding[];
  settlement_fund: string;
}

/**
 * Merge duplicate tickers across all accounts/brokers into a single Portfolio.
 * Holdings with the same ticker have their market_values summed.
 * All other fields (label, asset_class, expense_ratio, sector_tag) are taken from the first occurrence.
 * Output is sorted by market_value descending.
 */
export function consolidatePortfolio(
  holdings: Holding[],
  snapshot_date: string,
  account_label: string
): Portfolio {
  const byTicker: Record<string, Holding> = {};
  for (const h of holdings) {
    if (byTicker[h.ticker]) {
      byTicker[h.ticker] = {
        ...byTicker[h.ticker],
        market_value: byTicker[h.ticker].market_value + h.market_value,
      };
    } else {
      byTicker[h.ticker] = { ...h };
    }
  }
  const merged = Object.values(byTicker).sort((a, b) => b.market_value - a.market_value);
  return {
    snapshot_date,
    account_label,
    holdings: merged,
  };
}

export function normalizeVanguardAccounts(accounts: VanguardRawAccount[], account_id: string): Holding[] {
  const out: Holding[] = [];
  for (const account of accounts) {
    for (const raw of account.holdings) {
      const market_value = parseMoneyString(raw.balance);
      if (market_value <= 0) continue;

      const ticker = canonicalTicker(raw.symbol);
      const meta = lookupTicker(raw.symbol);
      out.push({
        ticker,
        label: ticker,
        market_value,
        asset_class: meta?.asset_class ?? "us_equity_total_market",
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
      });
    }

    const settlement = parseMoneyString(account.settlement_fund);
    if (settlement > 0) {
      out.push({
        ticker: "Cash",
        label: `Vanguard settlement fund (${account.account_number})`,
        market_value: settlement,
        asset_class: "cash",
        account_id,
        is_cash: true,
        is_pending_deployment: false,
        expense_ratio: null,
      });
    }
  }
  return out;
}
