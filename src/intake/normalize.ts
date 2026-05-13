import { Holding, Portfolio, UnderlyingComposition } from "../types";
import { lookupTicker, canonicalTicker } from "./tickerMetadata";
import { glidePathComposition, extractTargetYear } from "./composition";

/** Parse a dollar-formatted string like "$1,234.56" or "-$1,000.00" into a number. Returns 0 for empty/null/undefined. */
export function parseMoneyString(s: string | null | undefined): number {
  if (s == null || s === "") return 0;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const CURRENT_YEAR = new Date().getFullYear();

function attachCompositionIfApplicable(
  ticker: string,
  label: string,
  asset_class: string,
  meta: ReturnType<typeof lookupTicker>,
  current_year: number,
): UnderlyingComposition | undefined {
  if (meta?.underlying_composition) return meta.underlying_composition;
  if (asset_class === "target_date") {
    const y = extractTargetYear(label) ?? extractTargetYear(ticker);
    if (y !== null) return glidePathComposition(y, current_year);
    return glidePathComposition(2040, current_year);
  }
  if (asset_class === "balanced") {
    return { us_equity: 0.55, international_equity: 0.05, fixed_income: 0.35, cash: 0.05 };
  }
  return undefined;
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
      const asset_class = meta?.asset_class ?? "us_equity_total_market";
      out.push({
        ticker,
        label: raw.description || ticker,
        market_value,
        asset_class,
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
        underlying_composition: attachCompositionIfApplicable(
          ticker,
          raw.description || ticker,
          asset_class,
          meta,
          CURRENT_YEAR,
        ),
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
      const asset_class = meta?.asset_class ?? "us_equity_total_market";
      out.push({
        ticker: raw.symbol,
        label: raw.symbol,
        market_value,
        asset_class,
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
        underlying_composition: attachCompositionIfApplicable(
          raw.symbol,
          raw.symbol,
          asset_class,
          meta,
          CURRENT_YEAR,
        ),
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
 * Merge duplicate (account_id, ticker) pairs within a Portfolio.
 * Holdings with the same account_id AND ticker have their market_values summed.
 * Holdings with the same ticker but different account_ids are kept separate.
 * All other fields (label, asset_class, expense_ratio, sector_tag) are taken from the first occurrence.
 * Output is sorted by market_value descending.
 */
export function consolidatePortfolio(
  holdings: Holding[],
  snapshot_date: string,
  account_label: string
): Portfolio {
  const byKey: Record<string, Holding> = {};
  for (const h of holdings) {
    const key = `${h.account_id}::${h.ticker}`;
    if (byKey[key]) {
      byKey[key] = {
        ...byKey[key],
        market_value: byKey[key].market_value + h.market_value,
      };
    } else {
      byKey[key] = { ...h };
    }
  }
  const merged = Object.values(byKey).sort((a, b) => b.market_value - a.market_value);
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
      const asset_class = meta?.asset_class ?? "us_equity_total_market";
      out.push({
        ticker,
        label: ticker,
        market_value,
        asset_class,
        account_id,
        sector_tag: meta?.sector_tag,
        is_cash: false,
        is_pending_deployment: false,
        expense_ratio: meta?.expense_ratio ?? null,
        stock_metrics: meta?.stock_metrics,
        underlying_composition: attachCompositionIfApplicable(
          ticker,
          ticker,
          asset_class,
          meta,
          CURRENT_YEAR,
        ),
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
