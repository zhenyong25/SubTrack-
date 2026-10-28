Crypto holdings with a supported market now have a View chart action. It opens a price-per-coin chart in USD with current quote, 24-hour price change, hover details, 24H/7D/30D/90D/1Y ranges and a refresh button. Data refreshes every minute while visible. This is sampled market price history, not OHLC candlesticks or streaming trade data.

The feature reuses the existing DefiLlama current-price, percentage and chart endpoints. It shows retrieval time separately from the provider's quote timestamp and never appends a cached quote as though it were a new trade. Missing current quotes remain unavailable even if history exists; incomplete history and upstream errors have explicit states.

Wallet tokens retain their chain and contract identity. When a grouped holding contains multiple distinct markets, the chart includes a market selector. Known manual and exchange symbols use the existing curated CoinGecko ID mapping. Unsupported symbols have no guessed market. Supported manual holdings now use fetched market prices in portfolio totals, with their entered prices retained if no reliable quote is available.

Run `node scripts/test-crypto.mjs` for market identity, price/history, manual pricing and existing portfolio tests. Run `node scripts/test-crypto-chart-browser.mjs` for an isolated Chromium chart interaction check.

Provider documentation: https://api-docs.defillama.com/ . No database migration or new API key is required.
