export interface OptionTrade {
  id: string;
  symbol: string;
  type: 'Call' | 'Put';
  strike: number;
  expiry: string;
  tradeDate: string;
  premium: number;
  contracts: number;
  multiplier: number;
  fees: number; // total entry and exit fees
  currency: string;
  notes: string;
  exitPremium?: number;
  exitDate?: string;
}

export function optionMetrics(trade: Pick<OptionTrade, 'type' | 'strike' | 'premium' | 'contracts' | 'multiplier' | 'fees'>) {
  const quantity = trade.contracts * trade.multiplier;
  const cost = trade.premium * quantity + trade.fees;
  const breakEven = trade.strike + (trade.type === 'Call' ? 1 : -1) * (trade.premium + trade.fees / quantity);
  const payoff = (underlying: number) => Math.max(0, trade.type === 'Call' ? underlying - trade.strike : trade.strike - underlying) * quantity - cost;
  return { quantity, cost, maxLoss: cost, breakEven, maxProfit: trade.type === 'Call' ? Infinity : payoff(0), payoff };
}

export function optionPnl(trade: OptionTrade) {
  return trade.exitPremium == null ? null : (trade.exitPremium - trade.premium) * trade.contracts * trade.multiplier - trade.fees;
}

export function validateOption(trade: OptionTrade): string | null {
  if (typeof trade.symbol !== 'string' || !trade.symbol.trim()) return 'Enter an underlying ticker.';
  if (!['Call', 'Put'].includes(trade.type)) return 'Choose Call or Put.';
  if (![trade.strike, trade.premium, trade.contracts, trade.multiplier, trade.fees].every(Number.isFinite)
    || trade.strike <= 0 || trade.premium <= 0 || trade.fees < 0 || !Number.isInteger(trade.contracts) || trade.contracts < 1
    || !Number.isInteger(trade.multiplier) || trade.multiplier < 1) return 'Enter positive prices and whole contracts/multiplier; fees cannot be negative.';
  if (!Number.isFinite(trade.premium * trade.contracts * trade.multiplier + trade.fees)) return 'The entered position is too large.';
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(trade.tradeDate) || !validDate(trade.expiry) || trade.expiry < trade.tradeDate) return 'Expiration must be on or after the entry date.';
  if (trade.exitPremium != null && (!Number.isFinite(trade.exitPremium) || trade.exitPremium < 0 || !trade.exitDate || !validDate(trade.exitDate) || trade.exitDate < trade.tradeDate || trade.exitDate > trade.expiry)) return 'Enter a non-negative exit premium and an exit date between entry and expiration.';
  return null;
}
