# Technical overlays on individual stock charts

Open a stock's price chart from Investments. Moving-average controls appear above its
OHLC readout. All six values are visible: 5, 10, 20, 50, 100 and 200 periods. Click a value
to show or hide that line; 20, 50 and 200 are on initially. The selector switches between
simple and exponential moving averages. Hover or inspect a candle to see the values at
that candle, alongside its OHLC and volume. Zoom and pan continue to work.

A period means the chart's selected interval, not always a trading day. On a five-minute
chart, SMA 20 averages 20 five-minute closes. On a daily chart, it averages 20 daily closes.
Daily 50/200-day statistics also remain in the existing Price & trading card.

The chart requests preceding history so a short visible range can have a full MA window.
Only candles before the first visible bar warm up the calculation; future bars are never
used. A missing full window displays a dash instead of an invented value. If the optional
intraday lookback fails, the chart explains that it is using available history. Data gaps,
invalid OHLC and duplicate timestamps are handled before chart calculations.

SMA gives equal weight to each close in its full window. EMA uses alpha `2 / (period + 1)`
and starts with a full-window SMA. References: [Fidelity SMA](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/sma)
and [Fidelity EMA](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/ema).

The existing Trade → Patterns candlestick library is applied automatically to the stock's
real OHLC history at the chosen interval. Coloured markers show matched candles. Click a
marker or a recent-pattern chip to highlight its span and read its meaning, confirmation
criteria and limitations. The last ten visible candles are listed below the chart. These
are detected shapes, not predictions or automatic trading instructions; the latest candle
may still be forming. The 20-second collected-quote mode does not claim OHLC pattern evidence.

Long ranges group candles to keep rendering responsive. Moving averages and pattern
recognition run on the original data before grouping. A grouped candle displays the average
at its last original close; the chart explicitly explains this grouping. A stock change
remounts the detail view so another stock's candles, ticks and highlights cannot carry over.

Checks: `npm run test:ticker`, `npm run test:trading`, `npm run test:ticker:browser`.
The browser check uses isolated synthetic quotes and covers warmup, SMA/EMA switching,
overlays, pattern detection/selection, hover values, zoom, daily/grouped views, quote-only
mode, missing/empty history, stock switching and a 390-pixel mobile view. Screenshots are
saved under `artifacts/ticker-technicals/`.
