import type { InvestmentHolding, InvestmentValuation } from '../types';
import type { StockIntradayHistory } from './stockQuoteService';

// A holding only exists in this history after its first recorded valuation.
// Subsequent records reset the value/quantity anchor; market closes fill the gaps.
export function recordedHoldingValueAt(holding: InvestmentHolding, records: InvestmentValuation[], market: StockIntradayHistory | undefined, timestamp: number) {
  const record = records.filter(item => new Date(item.valuationDate).getTime() <= timestamp).at(-1);
  if (!record) return { value: 0, currency: holding.currency };
  const currency = record.currency || holding.currency;
  const recordedAt = new Date(record.valuationDate).getTime();
  const candle = market?.candles.filter(item => item.timestamp > recordedAt && item.timestamp <= timestamp).at(-1);
  if (!candle || (market?.currency && market.currency !== currency) || record.price <= 0) return { value: Number(record.marketValue), currency };
  const units = holding.positionSide === 'Short' ? holding.units : Number(record.marketValue) / Number(record.price);
  const direction = holding.positionSide === 'Short' ? -1 : 1;
  return { value: Number(record.marketValue) + direction * units * (candle.close - Number(record.price)), currency };
}
