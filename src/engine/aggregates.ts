import {
  Portfolio,
  PortfolioAggregates,
  DuplicateGroup,
  Holding,
  SectorHolding,
  CrossAccountGroup,
  AccountConfig,
  UnderlyingComposition,
  AssetClass,
} from "../types";

const EQUITY_CLASSES: string[] = [
  "us_equity_total_market", "us_equity_large_cap", "us_equity_large_cap_growth",
  "us_equity_small_mid", "us_equity_sector", "individual_stock",
];
const BOND_CLASSES: string[] = ["us_bond_aggregate", "us_bond_short", "us_bond_tips"];

const FUNGIBLE_CLASSES: string[] = [
  "us_equity_total_market",
  "us_equity_large_cap",
  "us_equity_large_cap_growth",
  "us_equity_small_mid",
  "us_bond_aggregate",
  "us_bond_short",
  "us_bond_tips",
  "international_equity",
];

/**
 * Effective-position key for grouping duplicates:
 * - Fungible passive classes (FSKAX/VTSAX/ITOT all hit us_equity_total_market): key by class.
 * - Everything else (sector ETFs, individual stocks, balanced, target-date): key by ticker.
 * Two holdings with the same key represent the same effective economic exposure.
 */
function effectiveKey(h: Holding): string {
  if (FUNGIBLE_CLASSES.includes(h.asset_class)) return `class:${h.asset_class}`;
  return `ticker:${h.ticker}`;
}

function getComposition(h: Holding): UnderlyingComposition | null {
  if (h.underlying_composition) return h.underlying_composition;
  return null;
}

export function computeAggregates(
  portfolio: Portfolio,
  accounts?: AccountConfig,
): PortfolioAggregates {
  const holdings = portfolio.holdings;
  const total_value = holdings.reduce((sum, h) => sum + h.market_value, 0);
  const w = (h: Holding) => (total_value > 0 ? h.market_value / total_value : 0);

  const fundHoldings = holdings.filter(h => h.expense_ratio !== null && !h.is_cash);
  const fundTotal = fundHoldings.reduce((sum, h) => sum + h.market_value, 0);
  const blended_expense_ratio = fundTotal > 0
    ? fundHoldings.reduce((sum, h) => sum + (h.expense_ratio! * h.market_value), 0) / fundTotal
    : 0;

  const holding_count = holdings.filter(h => !h.is_cash).length;

  const duplicate_groups: DuplicateGroup[] = [];
  const cross_account_groups: CrossAccountGroup[] = [];

  const byEffectiveKey: Record<string, Holding[]> = {};
  for (const h of holdings.filter(h => !h.is_cash)) {
    const key = effectiveKey(h);
    if (!byEffectiveKey[key]) byEffectiveKey[key] = [];
    byEffectiveKey[key].push(h);
  }

  for (const [key, group] of Object.entries(byEffectiveKey)) {
    if (group.length < 2) continue;

    const byAccount: Record<string, Holding[]> = {};
    for (const h of group) {
      if (!byAccount[h.account_id]) byAccount[h.account_id] = [];
      byAccount[h.account_id].push(h);
    }

    const sameAccountDups = Object.values(byAccount).filter(arr => arr.length >= 2);
    for (const arr of sameAccountDups) {
      duplicate_groups.push({
        label: arr[0].asset_class.replace(/_/g, " "),
        tickers: arr.map(h => h.ticker),
        combined_weight: arr.reduce((sum, h) => sum + w(h), 0),
      });
    }

    if (Object.keys(byAccount).length >= 2) {
      cross_account_groups.push({
        asset_class: group[0].asset_class,
        label: key.startsWith("ticker:") ? group[0].ticker : group[0].asset_class.replace(/_/g, " "),
        tickers_by_account: group.map(h => ({ account_id: h.account_id, ticker: h.ticker })),
        combined_weight: group.reduce((sum, h) => sum + w(h), 0),
      });
    }
  }

  let equity_weight = 0;
  let international_weight = 0;
  let fixed_income_weight = 0;
  let composition_cash_weight = 0;

  for (const h of holdings) {
    const wt = w(h);
    const comp = getComposition(h);
    if (comp) {
      equity_weight += wt * comp.us_equity;
      international_weight += wt * comp.international_equity;
      fixed_income_weight += wt * comp.fixed_income;
      composition_cash_weight += wt * comp.cash;
    } else {
      if (EQUITY_CLASSES.includes(h.asset_class)) equity_weight += wt;
      if (h.asset_class === "international_equity") international_weight += wt;
      if (BOND_CLASSES.includes(h.asset_class)) fixed_income_weight += wt;
    }
  }

  const constrainedSet = new Set<string>(
    (accounts?.accounts ?? [])
      .filter(a => a.constraints?.excluded_from_deployment === true)
      .map(a => a.id),
  );

  const cashHoldings = holdings.filter(h => h.is_cash);
  const cash_weight = cashHoldings.reduce((sum, h) => sum + w(h), 0) + composition_cash_weight;

  const pending_holdings = cashHoldings.filter(h => h.is_pending_deployment);
  const pending_cash_weight = pending_holdings.reduce((sum, h) => sum + w(h), 0);
  const pending_cash_value = pending_holdings.reduce((sum, h) => sum + h.market_value, 0);
  const firstPending = pending_holdings[0];

  const constrained_cash_weight = cashHoldings
    .filter(h => constrainedSet.has(h.account_id))
    .reduce((sum, h) => sum + w(h), 0);

  const idle_cash_weight =
    cash_weight - pending_cash_weight - constrained_cash_weight;

  const sorted = [...holdings].sort((a, b) =>
    b.market_value !== a.market_value
      ? b.market_value - a.market_value
      : a.ticker.localeCompare(b.ticker)
  );
  const top3 = sorted.slice(0, 3);
  const top3_weight = top3.reduce((sum, h) => sum + w(h), 0);
  const top3_tickers = top3.map(h => h.ticker);

  const individual_stock_weight = holdings
    .filter(h => h.asset_class === "individual_stock")
    .reduce((sum, h) => sum + w(h), 0);

  const balanced_weight = holdings
    .filter(h => h.asset_class === "balanced" || h.asset_class === "target_date")
    .reduce((sum, h) => sum + w(h), 0);

  const sector_map: Record<string, string[]> = {};
  for (const h of holdings.filter(h => h.sector_tag)) {
    const tag = h.sector_tag!;
    if (!sector_map[tag]) sector_map[tag] = [];
    sector_map[tag].push(h.ticker);
  }
  const sector_holdings: SectorHolding[] = Object.entries(sector_map).map(([sector_tag, tickers]) => ({
    sector_tag,
    tickers,
    combined_weight: holdings
      .filter(h => tickers.includes(h.ticker))
      .reduce((sum, h) => sum + w(h), 0),
  }));

  return {
    total_value,
    blended_expense_ratio,
    holding_count,
    duplicate_groups,
    cross_account_groups,
    top3_weight,
    top3_tickers,
    international_weight,
    cash_weight,
    idle_cash_weight,
    constrained_cash_weight,
    pending_cash_weight,
    pending_cash_value,
    equity_weight,
    fixed_income_weight,
    individual_stock_weight,
    balanced_weight,
    sector_holdings,
    pending_deployment_label: firstPending?.deployment_label,
    pending_deployment_date: firstPending?.deployment_date,
  };
}
