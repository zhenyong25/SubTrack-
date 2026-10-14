import { InvestmentHolding, InvestmentKind, InvestmentTransactionType, InvestmentValuation } from '../types';

export interface PositionMetrics {
  basis: number;
  currentValue: number;
  gain: number;
  gainPct: number;
}

// A short position profits when price falls, so its gain is the mirror image of a long
// position's - and its "current value" (equity contributed to the portfolio) is the cost
// basis adjusted by that gain, not units * currentPrice (which would read as the short's
// notional exposure, not what it's actually worth to the portfolio). For a long position
// this reduces to the familiar units * currentPrice, so existing holdings are unaffected.
export const getPositionMetrics = (investment: InvestmentHolding): PositionMetrics => {
  const basis = investment.units * investment.averageCost;
  const priceDelta = investment.currentPrice - investment.averageCost;
  const gain = (investment.positionSide === 'Short' ? -priceDelta : priceDelta) * investment.units;
  const currentValue = basis + gain;
  const gainPct = basis > 0 ? (gain / basis) * 100 : 0;
  return { basis, currentValue, gain, gainPct };
};

export interface TradeInput {
  transactionType: InvestmentTransactionType;
  units: number;
  price: number;
  fees: number;
  tradeDate: string;
}

// How a logged transaction changes a holding, and the profit or loss it locks in (average-cost
// method). A long is opened by Buy and closed by Sell; a short is the mirror image - opened by
// Sell (short sale) and closed by Buy (buying back / covering) - so a short's average cost is
// the average price it was sold at, and covering below that is a gain.
export const applyInvestmentTransaction = (
  holding: InvestmentHolding,
  trade: TradeInput,
): { holding: InvestmentHolding; realizedPnl?: number } => {
  const isShort = holding.positionSide === 'Short';
  const type = trade.transactionType;
  const prevUnits = holding.units;
  const prevBasis = prevUnits * holding.averageCost;
  const units = Math.max(0, trade.units);
  const tradeValue = units * trade.price;

  const opens = isShort ? type === 'Sell' : type === 'Buy' || type === 'Transfer In';
  const closes = isShort ? type === 'Buy' : type === 'Sell' || type === 'Transfer Out';

  if (opens) {
    const nextUnits = prevUnits + units;
    // Fees add to a long's cost but eat into a short's sale proceeds.
    const nextBasis = prevBasis + tradeValue + (isShort ? -trade.fees : trade.fees);
    return {
      holding: {
        ...holding,
        units: nextUnits,
        averageCost: nextUnits > 0 ? nextBasis / nextUnits : 0,
        acquiredDate: holding.acquiredDate || trade.tradeDate,
      },
    };
  }

  if (closes) {
    const closedUnits = Math.min(units, prevUnits);
    const nextUnits = prevUnits - closedUnits;
    const nextHolding = { ...holding, units: nextUnits, averageCost: nextUnits > 0 ? holding.averageCost : 0 };
    // Transfers move units between accounts without a sale, so they realize nothing.
    const isRealTrade = type === 'Sell' || (isShort && type === 'Buy');
    if (!isRealTrade) return { holding: nextHolding };
    const perUnit = isShort ? holding.averageCost - trade.price : trade.price - holding.averageCost;
    return { holding: nextHolding, realizedPnl: closedUnits * perUnit - trade.fees };
  }

  if (type === 'Fee') {
    if (isShort) return { holding, realizedPnl: -trade.fees };
    const nextBasis = prevBasis + trade.fees;
    return { holding: { ...holding, averageCost: prevUnits > 0 ? nextBasis / prevUnits : holding.averageCost } };
  }

  // Dividends are logged as an amount in the price field. A short owes them instead of receiving them.
  if (type === 'Dividend') return { holding, realizedPnl: isShort ? -trade.price : trade.price };

  return { holding };
};

// What each type is called for the position it's on ("Buy" means something different to a short).
export const transactionTypeLabel = (type: InvestmentTransactionType, isShort: boolean): string => {
  if (isShort && type === 'Sell') return 'Short sell';
  if (isShort && type === 'Buy') return 'Buy back';
  return type;
};

// Oldest first. Several values can be logged on the same day, so ties on the (date-only)
// valuationDate fall back to when each was logged.
export const compareValuations = (a: InvestmentValuation, b: InvestmentValuation) =>
  a.valuationDate.split('T')[0].localeCompare(b.valuationDate.split('T')[0])
  || (a.createdAt || '').localeCompare(b.createdAt || '');

export const colorForInvestmentKind = (kind: InvestmentKind): string => {
  switch (kind) {
    case 'Crypto': return '#8b5cf6';
    case 'Stocks': return '#0ea5e9';
    case 'Pokemon Cards': return '#f59e0b';
    case 'Poker (MTT)': return '#ec4899';
    case 'Cash': return '#10b981';
    default: return '#64748b';
  }
};

// Poker (MTT) was removed from the Portfolio UI; its holdings stay in storage but are kept out
// of everything the app shows or totals.
export const isPortfolioHolding = (holding: InvestmentHolding) => holding.kind !== 'Poker (MTT)';
