import { Holding } from "../types";
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
export function normalizeFidelityAccounts(accounts: FidelityRawAccount[]): Holding[] {
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
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
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

export function normalizeEmpowerAccounts(accounts: EmpowerRawAccount[]): Holding[] {
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
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
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

export function normalizeVanguardAccounts(accounts: VanguardRawAccount[]): Holding[] {
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
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
      });
    }

    const settlement = parseMoneyString(account.settlement_fund);
    if (settlement > 0) {
      out.push({
        ticker: "Cash",
        label: `Vanguard settlement fund (${account.account_number})`,
        market_value: settlement,
        asset_class: "cash",
        is_cash: true,
        is_pending_deployment: false,
        expense_ratio: null,
      });
    }
  }
  return out;
}
