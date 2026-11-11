// Shared display formats, so amounts and dates read the same on every screen.

// Money as shown on screen: two decimals with thousands separators (12,000.00). Nothing for a
// missing value, so optional amounts can be passed straight through.
export const formatAmount = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? ''
    : value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

// A calendar date as the rest of the app writes it: "Nov 12, 2026".
export const formatShortDate = (date: Date | string | number) =>
  new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
