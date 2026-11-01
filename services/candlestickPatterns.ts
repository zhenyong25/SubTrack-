import type { StockCandle } from './stockQuoteService';

// A reference of common candlestick patterns: how each looks, how to recognise it, what it
// suggests, plus a detector that checks real daily candles for it. The detectors follow the usual
// textbook rules with fixed thresholds, so they flag shapes, not trade signals.

export type Bar = Pick<StockCandle, 'open' | 'high' | 'low' | 'close'>;
export type PatternSignal = 'bullish' | 'bearish' | 'neutral';
export type PatternFamily = 'Single candle' | 'Two candles' | 'Three candles' | 'Four candles' | 'Five candles';

export interface CandlestickPattern {
  id: string;
  name: string;
  aka?: string;
  signal: PatternSignal;
  kind: 'Reversal' | 'Continuation' | 'Indecision';
  family: PatternFamily;
  // The move the pattern needs before it, used to draw the example and to check real candles.
  trend: 'up' | 'down' | null;
  example: Bar[];
  identify: string[];
  meaning: string;
  confirm: string;
  watchOut: string;
  reliability: 'Low' | 'Medium' | 'High';
  detect: (bars: Bar[], index: number) => boolean;
}

const body = (bar: Bar) => Math.abs(bar.close - bar.open);
const range = (bar: Bar) => bar.high - bar.low;
const upper = (bar: Bar) => bar.high - Math.max(bar.open, bar.close);
const lower = (bar: Bar) => Math.min(bar.open, bar.close) - bar.low;
const rising = (bar: Bar) => bar.close > bar.open;
const falling = (bar: Bar) => bar.close < bar.open;
const middle = (bar: Bar) => (bar.open + bar.close) / 2;
const top = (bar: Bar) => Math.max(bar.open, bar.close);
const bottom = (bar: Bar) => Math.min(bar.open, bar.close);

// Average body and range of up to ten candles before `index`, so "long" and "small" are relative.
const averages = (bars: Bar[], index: number) => {
  const before = bars.slice(Math.max(0, index - 10), index);
  const sample = before.length ? before : [bars[index]];
  return {
    body: sample.reduce((sum, bar) => sum + body(bar), 0) / sample.length,
    range: sample.reduce((sum, bar) => sum + range(bar), 0) / sample.length,
  };
};

// Direction of the three closes before the pattern starts.
export const trendBefore = (bars: Bar[], start: number): 'up' | 'down' | null => {
  if (start < 3) return null;
  const last = bars[start - 1].close;
  const earlier = bars[start - 3].close;
  if (last < earlier && last < bars[start - 2].close) return 'down';
  if (last > earlier && last > bars[start - 2].close) return 'up';
  return null;
};

const isDoji = (bar: Bar) => range(bar) > 0 && body(bar) <= range(bar) * 0.1;
const hammerShape = (bar: Bar) => range(bar) > 0 && body(bar) >= range(bar) * 0.05 && lower(bar) >= body(bar) * 2 && upper(bar) <= range(bar) * 0.12;
const invertedShape = (bar: Bar) => range(bar) > 0 && body(bar) >= range(bar) * 0.05 && upper(bar) >= body(bar) * 2 && lower(bar) <= range(bar) * 0.12;
const isLong = (bars: Bar[], index: number) => body(bars[index]) >= averages(bars, index).body && body(bars[index]) >= range(bars[index]) * 0.5;

// Shorthand for the examples: open, high, low, close.
const b = (open: number, high: number, low: number, close: number): Bar => ({ open, high, low, close });

export const CANDLESTICK_PATTERNS: CandlestickPattern[] = [
  {
    id: 'doji', name: 'Doji', signal: 'neutral', kind: 'Indecision', family: 'Single candle', trend: null,
    example: [b(100, 101.6, 98.4, 100.05)],
    identify: ['Open and close are at (or almost at) the same price', 'Body is tiny - 10% of the day\'s range or less', 'Wicks can be any length'],
    meaning: 'Buyers and sellers ended the session even. After a strong move it warns the move is losing steam.',
    confirm: 'Wait for the next candle: a close beyond the doji\'s high or low shows which side took over.',
    watchOut: 'In a sideways market dojis are common and mean very little.',
    reliability: 'Low',
    detect: (bars, i) => isDoji(bars[i]),
  },
  {
    id: 'dragonfly-doji', name: 'Dragonfly Doji', signal: 'bullish', kind: 'Reversal', family: 'Single candle', trend: 'down',
    example: [b(99, 99.1, 95.6, 99.05)],
    identify: ['Open, high and close are at about the same price', 'Long lower wick, little or no upper wick', 'Shows up after a decline'],
    meaning: 'Sellers pushed price well down, but buyers drove it all the way back by the close.',
    confirm: 'A rising candle that closes above the dragonfly\'s high.',
    watchOut: 'At the top of an uptrend the same shape is a warning, not a buy signal.',
    reliability: 'Medium',
    detect: (bars, i) => isDoji(bars[i]) && upper(bars[i]) <= range(bars[i]) * 0.1 && lower(bars[i]) >= range(bars[i]) * 0.6 && trendBefore(bars, i) === 'down',
  },
  {
    id: 'gravestone-doji', name: 'Gravestone Doji', signal: 'bearish', kind: 'Reversal', family: 'Single candle', trend: 'up',
    example: [b(101, 104.4, 100.9, 100.95)],
    identify: ['Open, low and close are at about the same price', 'Long upper wick, little or no lower wick', 'Shows up after a rally'],
    meaning: 'Buyers pushed price well up, but sellers drove it all the way back down by the close.',
    confirm: 'A falling candle that closes below the gravestone\'s low.',
    watchOut: 'Less meaningful on low volume or in the middle of a range.',
    reliability: 'Medium',
    detect: (bars, i) => isDoji(bars[i]) && lower(bars[i]) <= range(bars[i]) * 0.1 && upper(bars[i]) >= range(bars[i]) * 0.6 && trendBefore(bars, i) === 'up',
  },
  {
    id: 'long-legged-doji', name: 'Long-legged Doji', signal: 'neutral', kind: 'Indecision', family: 'Single candle', trend: null,
    example: [b(100, 103.4, 96.6, 100.1)],
    identify: ['Tiny body near the middle of the candle', 'Long wicks on both sides', 'Much wider range than recent candles'],
    meaning: 'A big tug-of-war: price swung far both ways and finished where it started.',
    confirm: 'The break of its high or low on the next candles.',
    watchOut: 'Often appears around news; treat it as a pause, not a direction.',
    reliability: 'Low',
    detect: (bars, i) => isDoji(bars[i]) && upper(bars[i]) >= range(bars[i]) * 0.3 && lower(bars[i]) >= range(bars[i]) * 0.3 && range(bars[i]) >= averages(bars, i).range * 1.3,
  },
  {
    id: 'spinning-top', name: 'Spinning Top', signal: 'neutral', kind: 'Indecision', family: 'Single candle', trend: null,
    example: [b(99.6, 101.8, 98, 100.4)],
    identify: ['Small body, larger than a doji\'s', 'Upper and lower wicks both longer than the body', 'Colour doesn\'t matter'],
    meaning: 'Neither side was in control. After a trend, momentum is fading.',
    confirm: 'The direction of the next decisive candle.',
    watchOut: 'Very common - only worth noticing after a clear trend or at support or resistance.',
    reliability: 'Low',
    detect: (bars, i) => { const bar = bars[i]; return body(bar) > range(bar) * 0.1 && body(bar) <= range(bar) * 0.35 && upper(bar) >= body(bar) && lower(bar) >= body(bar); },
  },
  {
    id: 'hammer', name: 'Hammer', signal: 'bullish', kind: 'Reversal', family: 'Single candle', trend: 'down',
    example: [b(98.6, 99.7, 95.6, 99.6)],
    identify: ['Small body at the top of the candle', 'Lower wick at least twice the body', 'Little or no upper wick', 'Appears after a decline'],
    meaning: 'Sellers drove price down, buyers rejected the lows and closed near the high - a possible bottom.',
    confirm: 'The next candle closes above the hammer\'s close, ideally with higher volume.',
    watchOut: 'The same shape after a rally is a Hanging Man, which is bearish.',
    reliability: 'Medium',
    detect: (bars, i) => hammerShape(bars[i]) && trendBefore(bars, i) === 'down',
  },
  {
    id: 'inverted-hammer', name: 'Inverted Hammer', signal: 'bullish', kind: 'Reversal', family: 'Single candle', trend: 'down',
    example: [b(98.6, 102, 98.5, 99.4)],
    identify: ['Small body at the bottom of the candle', 'Upper wick at least twice the body', 'Little or no lower wick', 'Appears after a decline'],
    meaning: 'Buyers tested higher prices for the first time in a while. Sellers pushed back, but are weakening.',
    confirm: 'Needs a strong rising candle next; on its own it\'s weak.',
    watchOut: 'The same shape after a rally is a Shooting Star, which is bearish.',
    reliability: 'Low',
    detect: (bars, i) => invertedShape(bars[i]) && trendBefore(bars, i) === 'down',
  },
  {
    id: 'hanging-man', name: 'Hanging Man', signal: 'bearish', kind: 'Reversal', family: 'Single candle', trend: 'up',
    example: [b(101.4, 101.6, 97.6, 100.6)],
    identify: ['Same shape as a hammer: small body on top, long lower wick', 'Appears after a rally'],
    meaning: 'Sellers managed a big intraday drop at the top of a rally - buyers may be running out.',
    confirm: 'The next candle closes below the hanging man\'s body.',
    watchOut: 'Weak without confirmation - many hanging men are followed by higher prices.',
    reliability: 'Low',
    detect: (bars, i) => hammerShape(bars[i]) && trendBefore(bars, i) === 'up',
  },
  {
    id: 'shooting-star', name: 'Shooting Star', signal: 'bearish', kind: 'Reversal', family: 'Single candle', trend: 'up',
    example: [b(101.4, 104.8, 100.9, 101)],
    identify: ['Small body at the bottom of the candle', 'Upper wick at least twice the body', 'Little or no lower wick', 'Appears after a rally'],
    meaning: 'Buyers pushed to new highs, then sellers slammed price back near the open.',
    confirm: 'A falling candle next that closes below the star\'s body.',
    watchOut: 'After a decline the same shape is an Inverted Hammer.',
    reliability: 'Medium',
    detect: (bars, i) => invertedShape(bars[i]) && trendBefore(bars, i) === 'up',
  },
  {
    id: 'bullish-marubozu', name: 'Bullish Marubozu', signal: 'bullish', kind: 'Continuation', family: 'Single candle', trend: null,
    example: [b(98, 102.1, 97.9, 102)],
    identify: ['Long rising body', 'No (or almost no) wicks - opens at the low, closes at the high', 'Larger than recent candles'],
    meaning: 'Buyers were in control from the open to the close.',
    confirm: 'Follow-through the next day; price holding above the marubozu\'s midpoint.',
    watchOut: 'After a long run, a huge marubozu can mark exhaustion rather than strength.',
    reliability: 'Medium',
    detect: (bars, i) => rising(bars[i]) && body(bars[i]) >= range(bars[i]) * 0.9 && body(bars[i]) >= averages(bars, i).body * 1.3,
  },
  {
    id: 'bearish-marubozu', name: 'Bearish Marubozu', signal: 'bearish', kind: 'Continuation', family: 'Single candle', trend: null,
    example: [b(102, 102.1, 97.9, 98)],
    identify: ['Long falling body', 'No (or almost no) wicks - opens at the high, closes at the low', 'Larger than recent candles'],
    meaning: 'Sellers were in control from the open to the close.',
    confirm: 'Follow-through lower; price staying under the marubozu\'s midpoint.',
    watchOut: 'After a long decline, a huge marubozu can be capitulation.',
    reliability: 'Medium',
    detect: (bars, i) => falling(bars[i]) && body(bars[i]) >= range(bars[i]) * 0.9 && body(bars[i]) >= averages(bars, i).body * 1.3,
  },
  {
    id: 'bullish-engulfing', name: 'Bullish Engulfing', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(99.5, 99.8, 97.8, 98), b(97.6, 100.4, 97.4, 100.2)],
    identify: ['First candle falls', 'Second candle rises and its body completely covers the first body', 'Appears after a decline'],
    meaning: 'Buyers overwhelmed the previous day\'s selling in a single session.',
    confirm: 'The next candle holds above the engulfing candle\'s midpoint or closes higher.',
    watchOut: 'Much weaker if the first candle is tiny or the decline was short.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && rising(c) && c.open <= a.close && c.close >= a.open && body(c) > body(a) && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-engulfing', name: 'Bearish Engulfing', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(100.5, 102.2, 100.2, 102), b(102.4, 102.6, 99.6, 99.8)],
    identify: ['First candle rises', 'Second candle falls and its body completely covers the first body', 'Appears after a rally'],
    meaning: 'Sellers overwhelmed the previous day\'s buying in a single session.',
    confirm: 'The next candle stays below the engulfing candle\'s midpoint or closes lower.',
    watchOut: 'Much weaker if the first candle is tiny or the rally was short.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && falling(c) && c.open >= a.close && c.close <= a.open && body(c) > body(a) && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'bullish-harami', name: 'Bullish Harami', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 96.8, 97), b(97.8, 99.4, 97.6, 99)],
    identify: ['First candle: long and falling', 'Second candle: small and rising, body inside the first body', 'Appears after a decline'],
    meaning: '"Harami" means pregnant. Selling paused completely inside the previous range.',
    confirm: 'A close above the first candle\'s open (that\'s a Three Inside Up).',
    watchOut: 'A pause is not a reversal; many haramis resolve in the trend\'s direction.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && top(c) <= a.open && bottom(c) >= a.close && body(c) < body(a) * 0.6 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-harami', name: 'Bearish Harami', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103.2, 99.3, 103), b(102.2, 102.4, 100.6, 101)],
    identify: ['First candle: long and rising', 'Second candle: small and falling, body inside the first body', 'Appears after a rally'],
    meaning: 'Buying paused completely inside the previous range.',
    confirm: 'A close below the first candle\'s open (that\'s a Three Inside Down).',
    watchOut: 'Often just a pause before the rally continues.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && falling(c) && top(c) <= a.close && bottom(c) >= a.open && body(c) < body(a) * 0.6 && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'piercing-line', name: 'Piercing Line', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97, 97.2), b(96.6, 99.6, 96.4, 99.4)],
    identify: ['First candle: long and falling', 'Second candle opens below the first close and closes above the first body\'s midpoint', 'Second close stays below the first open'],
    meaning: 'After a weak open, buyers recovered more than half of the previous day\'s loss.',
    confirm: 'The next candle closes above the first candle\'s open.',
    watchOut: 'Closing above the whole first body makes it a Bullish Engulfing instead.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && c.open <= a.close && c.close > middle(a) && c.close < a.open && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'dark-cloud-cover', name: 'Dark Cloud Cover', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(103.4, 103.6, 100.4, 100.6)],
    identify: ['First candle: long and rising', 'Second candle opens above the first close and closes below the first body\'s midpoint', 'Second close stays above the first open'],
    meaning: 'After a strong open, sellers erased more than half of the previous day\'s gain.',
    confirm: 'The next candle closes below the first candle\'s open.',
    watchOut: 'Closing below the whole first body makes it a Bearish Engulfing instead.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && falling(c) && c.open >= a.close && c.close < middle(a) && c.close > a.open && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'tweezer-bottom', name: 'Tweezer Bottom', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(99.6, 99.8, 97, 97.6), b(97.6, 99.8, 97, 99.5)],
    identify: ['Two candles with (almost) the same low', 'First falls, second rises', 'Appears after a decline'],
    meaning: 'The same low was defended twice in a row - a short-term floor.',
    confirm: 'A close above the second candle\'s high.',
    watchOut: 'Matching lows happen by chance; it needs a clear prior decline to mean anything.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && rising(c) && Math.abs(a.low - c.low) <= averages(bars, i - 1).range * 0.05 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'tweezer-top', name: 'Tweezer Top', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(100.4, 103, 100.2, 102.4), b(102.4, 103, 100.2, 100.5)],
    identify: ['Two candles with (almost) the same high', 'First rises, second falls', 'Appears after a rally'],
    meaning: 'The same high was rejected twice in a row - a short-term ceiling.',
    confirm: 'A close below the second candle\'s low.',
    watchOut: 'Matching highs happen by chance; it needs a clear prior rally to mean anything.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && falling(c) && Math.abs(a.high - c.high) <= averages(bars, i - 1).range * 0.05 && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'morning-star', name: 'Morning Star', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(100.5, 100.7, 96.8, 97), b(96.4, 96.9, 95.6, 96.2), b(96.8, 99.8, 96.6, 99.6)],
    identify: ['1: long falling candle', '2: small body (any colour) that gaps or sits below the first', '3: rising candle closing above the middle of candle 1', 'Appears after a decline'],
    meaning: 'Selling pressure (1) stalls (2), then buyers take over (3).',
    confirm: 'Strongest when candle 3 has higher volume and the next day holds its gains.',
    watchOut: 'If candle 3 closes only slightly higher, it\'s a weak version.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 2) && body(m) <= body(a) * 0.35 && top(m) <= a.close + body(a) * 0.1 && rising(c) && c.close > middle(a) && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'evening-star', name: 'Evening Star', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 103.2, 99.3, 103), b(103.6, 104.4, 103.1, 103.8), b(103.2, 103.4, 100.2, 100.4)],
    identify: ['1: long rising candle', '2: small body (any colour) that gaps or sits above the first', '3: falling candle closing below the middle of candle 1', 'Appears after a rally'],
    meaning: 'Buying pressure (1) stalls (2), then sellers take over (3).',
    confirm: 'Strongest when candle 3 has higher volume and the next day stays weak.',
    watchOut: 'If candle 3 closes only slightly lower, it\'s a weak version.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && body(m) <= body(a) * 0.35 && bottom(m) >= a.close - body(a) * 0.1 && falling(c) && c.close < middle(a) && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'three-white-soldiers', name: 'Three White Soldiers', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(97, 99.3, 96.8, 99.1), b(98.4, 101, 98.2, 100.8), b(100.2, 102.8, 100, 102.6)],
    identify: ['Three rising candles in a row, each with a long body', 'Each opens inside the previous body and closes at a new high', 'Small upper wicks'],
    meaning: 'Steady, sustained buying over three sessions - a strong shift in sentiment.',
    confirm: 'Holds above the third candle\'s midpoint over the next sessions.',
    watchOut: 'After an extended rally it can mean the move is overbought.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const set = [bars[i - 2], bars[i - 1], bars[i]];
      const avg = averages(bars, i - 2).body;
      return set.every(bar => rising(bar) && body(bar) >= range(bar) * 0.6 && body(bar) >= avg * 0.8)
        && set.slice(1).every((bar, n) => bar.close > set[n].close && bar.open >= set[n].open && bar.open <= set[n].close);
    },
  },
  {
    id: 'three-black-crows', name: 'Three Black Crows', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(103, 103.2, 100.7, 100.9), b(101.6, 101.8, 99.2, 99.4), b(99.8, 100, 97.4, 97.6)],
    identify: ['Three falling candles in a row, each with a long body', 'Each opens inside the previous body and closes at a new low', 'Small lower wicks'],
    meaning: 'Steady, sustained selling over three sessions - a strong shift in sentiment.',
    confirm: 'Stays below the third candle\'s midpoint over the next sessions.',
    watchOut: 'After an extended decline it can mean the move is oversold.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const set = [bars[i - 2], bars[i - 1], bars[i]];
      const avg = averages(bars, i - 2).body;
      return set.every(bar => falling(bar) && body(bar) >= range(bar) * 0.6 && body(bar) >= avg * 0.8)
        && set.slice(1).every((bar, n) => bar.close < set[n].close && bar.open <= set[n].open && bar.open >= set[n].close);
    },
  },
  {
    id: 'three-inside-up', name: 'Three Inside Up', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(100.5, 100.7, 96.8, 97), b(97.6, 99.2, 97.4, 99), b(99, 101.4, 98.8, 101.2)],
    identify: ['1 and 2 form a Bullish Harami', '3: rising candle closing above candle 1\'s open'],
    meaning: 'A Bullish Harami that has been confirmed by the third candle.',
    confirm: 'Already includes confirmation; volume on candle 3 adds weight.',
    watchOut: 'Entries after candle 3 are already far from the low, so stops get wide.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 2) && rising(m) && top(m) <= a.open && bottom(m) >= a.close && body(m) < body(a) * 0.6 && rising(c) && c.close > a.open && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'three-inside-down', name: 'Three Inside Down', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 103.2, 99.3, 103), b(102.4, 102.6, 100.8, 101), b(101, 101.2, 98.6, 98.8)],
    identify: ['1 and 2 form a Bearish Harami', '3: falling candle closing below candle 1\'s open'],
    meaning: 'A Bearish Harami that has been confirmed by the third candle.',
    confirm: 'Already includes confirmation; volume on candle 3 adds weight.',
    watchOut: 'Entries after candle 3 are already far from the high, so stops get wide.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && falling(m) && top(m) <= a.close && bottom(m) >= a.open && body(m) < body(a) * 0.6 && falling(c) && c.close < a.open && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'rising-three-methods', name: 'Rising Three Methods', signal: 'bullish', kind: 'Continuation', family: 'Five candles', trend: 'up',
    example: [b(99, 102.7, 98.8, 102.5), b(102.2, 102.4, 101.2, 101.6), b(101.6, 101.8, 100.6, 101), b(101, 101.3, 100, 100.4), b(100.6, 104.2, 100.4, 104)],
    identify: ['1: long rising candle', '2-4: small candles drifting lower, staying inside candle 1\'s range', '5: long rising candle closing above candle 1\'s close'],
    meaning: 'A brief, orderly pause in an uptrend that buyers then resume.',
    confirm: 'Candle 5 on strong volume; the pause candles on light volume.',
    watchOut: 'If the pause candles break below candle 1\'s low, the pattern has failed.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 4) return false;
      const [a, x, y, z, e] = bars.slice(i - 4, i + 1);
      const pause = [x, y, z];
      return rising(a) && isLong(bars, i - 4) && pause.every(bar => body(bar) < body(a) * 0.5 && bar.high <= a.high && bar.low >= a.low)
        && z.close < x.open && rising(e) && e.close > a.close && body(e) >= body(a) * 0.7;
    },
  },
  {
    id: 'falling-three-methods', name: 'Falling Three Methods', signal: 'bearish', kind: 'Continuation', family: 'Five candles', trend: 'down',
    example: [b(101, 101.2, 97.3, 97.5), b(97.8, 98.8, 97.6, 98.4), b(98.4, 99.4, 98.2, 99), b(99, 100, 98.7, 99.6), b(99.4, 99.6, 95.8, 96)],
    identify: ['1: long falling candle', '2-4: small candles drifting higher, staying inside candle 1\'s range', '5: long falling candle closing below candle 1\'s close'],
    meaning: 'A brief, orderly bounce in a downtrend that sellers then resume.',
    confirm: 'Candle 5 on strong volume; the bounce candles on light volume.',
    watchOut: 'If the bounce candles break above candle 1\'s high, the pattern has failed.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 4) return false;
      const [a, x, y, z, e] = bars.slice(i - 4, i + 1);
      const pause = [x, y, z];
      return falling(a) && isLong(bars, i - 4) && pause.every(bar => body(bar) < body(a) * 0.5 && bar.high <= a.high && bar.low >= a.low)
        && z.close > x.open && falling(e) && e.close < a.close && body(e) >= body(a) * 0.7;
    },
  },
  {
    id: 'bullish-belt-hold', name: 'Bullish Belt Hold', signal: 'bullish', kind: 'Reversal', family: 'Single candle', trend: 'down',
    example: [b(97, 99.6, 97, 99.4)],
    identify: ['Opens at the low of the day (no lower wick)', 'Long rising body closing near the high', 'Appears after a decline'],
    meaning: 'Buyers took over from the opening bell and never let price trade lower.',
    confirm: 'The next candle holds above the belt hold\'s midpoint.',
    watchOut: 'Common and often short-lived; stronger when the body is unusually long.',
    reliability: 'Low',
    detect: (bars, i) => { const bar = bars[i]; return rising(bar) && lower(bar) <= range(bar) * 0.05 && body(bar) >= range(bar) * 0.7 && body(bar) >= averages(bars, i).body * 1.2 && trendBefore(bars, i) === 'down'; },
  },
  {
    id: 'bearish-belt-hold', name: 'Bearish Belt Hold', signal: 'bearish', kind: 'Reversal', family: 'Single candle', trend: 'up',
    example: [b(103, 103, 100.4, 100.6)],
    identify: ['Opens at the high of the day (no upper wick)', 'Long falling body closing near the low', 'Appears after a rally'],
    meaning: 'Sellers took over from the opening bell and never let price trade higher.',
    confirm: 'The next candle stays below the belt hold\'s midpoint.',
    watchOut: 'Common and often short-lived; stronger when the body is unusually long.',
    reliability: 'Low',
    detect: (bars, i) => { const bar = bars[i]; return falling(bar) && upper(bar) <= range(bar) * 0.05 && body(bar) >= range(bar) * 0.7 && body(bar) >= averages(bars, i).body * 1.2 && trendBefore(bars, i) === 'up'; },
  },
  {
    id: 'high-wave', name: 'High Wave', signal: 'neutral', kind: 'Indecision', family: 'Single candle', trend: null,
    example: [b(99.6, 103, 97, 100.4)],
    identify: ['Small body', 'Very long upper and lower wicks', 'Range much wider than recent candles'],
    meaning: 'Wild swings both ways with no winner - the market has lost its sense of direction.',
    confirm: 'Wait for a decisive close beyond its high or low.',
    watchOut: 'Often appears in a cluster before a big move, but it doesn\'t say which way.',
    reliability: 'Low',
    detect: (bars, i) => { const bar = bars[i]; return body(bar) > range(bar) * 0.1 && body(bar) <= range(bar) * 0.3 && upper(bar) >= range(bar) * 0.3 && lower(bar) >= range(bar) * 0.3 && range(bar) >= averages(bars, i).range * 1.5; },
  },
  {
    id: 'bullish-kicker', name: 'Bullish Kicker', aka: 'Bullish Kicking', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100, 100.2, 98, 98.2), b(100.6, 102.8, 100.5, 102.6)],
    identify: ['First candle falls with a solid body', 'Second candle opens above the first candle\'s open (a gap) and rises strongly', 'The bodies don\'t overlap'],
    meaning: 'A sudden, complete change in sentiment - often after news.',
    confirm: 'Price stays above the gap over the next sessions.',
    watchOut: 'If the gap fills quickly, the signal has failed.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && rising(c) && c.open > a.open && body(a) >= range(a) * 0.6 && body(c) >= range(c) * 0.6 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-kicker', name: 'Bearish Kicker', aka: 'Bearish Kicking', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(100, 102, 99.8, 101.8), b(99.4, 99.5, 97.2, 97.4)],
    identify: ['First candle rises with a solid body', 'Second candle opens below the first candle\'s open (a gap) and falls strongly', 'The bodies don\'t overlap'],
    meaning: 'A sudden, complete change in sentiment - often after news.',
    confirm: 'Price stays below the gap over the next sessions.',
    watchOut: 'If the gap fills quickly, the signal has failed.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && falling(c) && c.open < a.open && body(a) >= range(a) * 0.6 && body(c) >= range(c) * 0.6 && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'on-neck', name: 'On-Neck', signal: 'bearish', kind: 'Continuation', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97.2, 97.4), b(96.4, 97.5, 96.2, 97.25)],
    identify: ['First candle: long and falling', 'Second candle opens below the first low and rises', 'It closes right at the first candle\'s low'],
    meaning: 'A weak bounce that couldn\'t even reach the previous close - sellers are still in charge.',
    confirm: 'A close below the second candle\'s low.',
    watchOut: 'If the bounce closes well into the first body, see Thrusting instead.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && c.open < a.low && Math.abs(c.close - a.low) <= range(a) * 0.05 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'in-neck', name: 'In-Neck', signal: 'bearish', kind: 'Continuation', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97.2, 97.4), b(96.4, 97.8, 96.2, 97.6)],
    identify: ['First candle: long and falling', 'Second candle opens below the first low and rises', 'It closes just inside the first body, barely above its close'],
    meaning: 'Buyers managed only a token recovery; the decline is likely to continue.',
    confirm: 'A close below the second candle\'s low.',
    watchOut: 'Differences from On-Neck and Thrusting are small; the deeper the close, the weaker the bearish signal.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && c.open < a.low && c.close >= a.close && c.close <= a.close + body(a) * 0.15 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'thrusting', name: 'Thrusting', signal: 'bearish', kind: 'Continuation', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97.2, 97.4), b(96.4, 98.6, 96.2, 98.4)],
    identify: ['First candle: long and falling', 'Second candle opens below the first low and rises', 'It closes well into the first body but below its midpoint'],
    meaning: 'A stronger bounce, but still short of the halfway mark - a pause rather than a turn.',
    confirm: 'A close below the second candle\'s low resumes the decline.',
    watchOut: 'Closing above the midpoint makes it a Piercing Line, which is bullish.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && c.open < a.low && c.close > a.close + body(a) * 0.15 && c.close < middle(a) && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bullish-counterattack', name: 'Bullish Counterattack', aka: 'Bullish Meeting Lines', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97.2, 97.4), b(95.2, 97.5, 95, 97.4)],
    identify: ['First candle: long and falling', 'Second candle gaps down, then rallies', 'Both candles close at the same price'],
    meaning: 'Sellers pushed lower at the open, buyers fought all the way back to yesterday\'s close.',
    confirm: 'A rising candle next.',
    watchOut: 'Weaker than a Piercing Line because price only got back to the prior close.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && rising(c) && body(c) >= range(c) * 0.5 && c.open < a.close && Math.abs(c.close - a.close) <= range(a) * 0.05 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-counterattack', name: 'Bearish Counterattack', aka: 'Bearish Meeting Lines', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(105, 105.2, 102.6, 102.8)],
    identify: ['First candle: long and rising', 'Second candle gaps up, then sells off', 'Both candles close at the same price'],
    meaning: 'Buyers pushed higher at the open, sellers drove it all the way back to yesterday\'s close.',
    confirm: 'A falling candle next.',
    watchOut: 'Weaker than Dark Cloud Cover because price only got back to the prior close.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && falling(c) && body(c) >= range(c) * 0.5 && c.open > a.close && Math.abs(c.close - a.close) <= range(a) * 0.05 && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'matching-low', name: 'Matching Low', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 98, 98.2), b(99.4, 99.6, 98, 98.2)],
    identify: ['Two falling candles in a row', 'Both close at the same price', 'Appears after a decline'],
    meaning: 'Sellers failed to push the close any lower - a possible support level.',
    confirm: 'A close above the second candle\'s open.',
    watchOut: 'Equal closes can be coincidence; it needs confirmation.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && falling(c) && Math.abs(a.close - c.close) <= range(a) * 0.03 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bullish-separating-lines', name: 'Bullish Separating Lines', signal: 'bullish', kind: 'Continuation', family: 'Two candles', trend: 'up',
    example: [b(101, 101.2, 99.6, 99.8), b(101, 103, 100.9, 102.8)],
    identify: ['During an uptrend, one falling candle', 'Next candle opens at the same price as that candle\'s open', 'It rises strongly'],
    meaning: 'The dip was rejected immediately; the uptrend resumes.',
    confirm: 'Follow-through above the second candle\'s high.',
    watchOut: 'Only meaningful inside an established uptrend.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && rising(c) && Math.abs(c.open - a.open) <= range(a) * 0.05 && isLong(bars, i) && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'bearish-separating-lines', name: 'Bearish Separating Lines', signal: 'bearish', kind: 'Continuation', family: 'Two candles', trend: 'down',
    example: [b(99, 100.4, 98.8, 100.2), b(99, 99.1, 97, 97.2)],
    identify: ['During a downtrend, one rising candle', 'Next candle opens at the same price as that candle\'s open', 'It falls strongly'],
    meaning: 'The bounce was rejected immediately; the downtrend resumes.',
    confirm: 'Follow-through below the second candle\'s low.',
    watchOut: 'Only meaningful inside an established downtrend.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && falling(c) && Math.abs(c.open - a.open) <= range(a) * 0.05 && isLong(bars, i) && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'homing-pigeon', name: 'Homing Pigeon', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97, 97.2), b(99.4, 99.6, 97.8, 98)],
    identify: ['Two falling candles', 'The second body sits inside the first body', 'Appears after a decline'],
    meaning: 'Selling is shrinking - like a harami, but both candles still fall.',
    confirm: 'A rising candle closing above the second candle\'s open.',
    watchOut: 'Weak alone; treat it as a slowdown, not a reversal.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && falling(c) && top(c) <= a.open && bottom(c) >= a.close && body(c) < body(a) * 0.7 && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'descending-hawk', name: 'Descending Hawk', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(100.6, 102.2, 100.4, 102)],
    identify: ['Two rising candles', 'The second body sits inside the first body', 'Appears after a rally'],
    meaning: 'Buying is shrinking - the rally is losing energy.',
    confirm: 'A falling candle closing below the second candle\'s open.',
    watchOut: 'Weak alone; treat it as a slowdown, not a reversal.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && rising(c) && top(c) <= a.close && bottom(c) >= a.open && body(c) < body(a) * 0.7 && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'bullish-harami-cross', name: 'Bullish Harami Cross', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 96.8, 97), b(98.5, 99.2, 97.8, 98.55)],
    identify: ['First candle: long and falling', 'Second candle is a doji inside the first body', 'Appears after a decline'],
    meaning: 'A harami where the second day is pure indecision - selling has stopped dead.',
    confirm: 'A rising candle closing above the doji\'s high.',
    watchOut: 'Like any harami, it often resolves in the trend\'s direction.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && isDoji(c) && top(c) <= a.open && bottom(c) >= a.close && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-harami-cross', name: 'Bearish Harami Cross', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103.2, 99.3, 103), b(101.5, 102.2, 100.8, 101.45)],
    identify: ['First candle: long and rising', 'Second candle is a doji inside the first body', 'Appears after a rally'],
    meaning: 'A harami where the second day is pure indecision - buying has stopped dead.',
    confirm: 'A falling candle closing below the doji\'s low.',
    watchOut: 'Like any harami, it often resolves in the trend\'s direction.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && isDoji(c) && top(c) <= a.close && bottom(c) >= a.open && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'bullish-doji-star', name: 'Bullish Doji Star', signal: 'bullish', kind: 'Reversal', family: 'Two candles', trend: 'down',
    example: [b(100.5, 100.7, 97, 97.2), b(96.6, 97.1, 96, 96.65)],
    identify: ['First candle: long and falling', 'Second candle is a doji that opens below the first close', 'Appears after a decline'],
    meaning: 'After a strong down day, the market suddenly stalls - the first half of a Morning Doji Star.',
    confirm: 'A rising candle next (completing a Morning Doji Star).',
    watchOut: 'Without the third candle it\'s only a warning.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 1) && isDoji(c) && top(c) < a.close && trendBefore(bars, i - 1) === 'down';
    },
  },
  {
    id: 'bearish-doji-star', name: 'Bearish Doji Star', signal: 'bearish', kind: 'Reversal', family: 'Two candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(103.4, 104, 102.9, 103.35)],
    identify: ['First candle: long and rising', 'Second candle is a doji that opens above the first close', 'Appears after a rally'],
    meaning: 'After a strong up day, the market suddenly stalls - the first half of an Evening Doji Star.',
    confirm: 'A falling candle next (completing an Evening Doji Star).',
    watchOut: 'Without the third candle it\'s only a warning.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 1) return false;
      const [a, c] = [bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 1) && isDoji(c) && bottom(c) > a.close && trendBefore(bars, i - 1) === 'up';
    },
  },
  {
    id: 'morning-doji-star', name: 'Morning Doji Star', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(100.5, 100.7, 96.8, 97), b(96.5, 97, 95.9, 96.55), b(97, 99.8, 96.8, 99.6)],
    identify: ['1: long falling candle', '2: a doji at or below the first close', '3: rising candle closing above the middle of candle 1'],
    meaning: 'A Morning Star whose middle day shows complete indecision - a cleaner turn.',
    confirm: 'The next session holds above candle 3\'s midpoint.',
    watchOut: 'If candle 3 is weak, wait for more confirmation.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 2) && isDoji(m) && top(m) <= a.close && rising(c) && c.close > middle(a) && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'evening-doji-star', name: 'Evening Doji Star', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 103.2, 99.3, 103), b(103.5, 104.1, 103, 103.45), b(103.2, 103.4, 100.2, 100.4)],
    identify: ['1: long rising candle', '2: a doji at or above the first close', '3: falling candle closing below the middle of candle 1'],
    meaning: 'An Evening Star whose middle day shows complete indecision - a cleaner turn.',
    confirm: 'The next session stays below candle 3\'s midpoint.',
    watchOut: 'If candle 3 is weak, wait for more confirmation.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && isDoji(m) && bottom(m) >= a.close && falling(c) && c.close < middle(a) && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'bullish-abandoned-baby', name: 'Bullish Abandoned Baby', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(100.5, 100.7, 97.6, 97.8), b(96.6, 97, 96.2, 96.62), b(97.6, 100, 97.4, 99.8)],
    identify: ['1: long falling candle', '2: a doji that gaps completely below candle 1 (wicks don\'t touch)', '3: rising candle that gaps completely above the doji'],
    meaning: 'The doji is "abandoned" between two gaps - a rare, sharp bottom.',
    confirm: 'Already strong; price holding above the second gap confirms it.',
    watchOut: 'True gaps on both sides are rare in liquid stocks, so real examples are uncommon.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && isLong(bars, i - 2) && isDoji(m) && m.high < a.low && m.high < c.low && rising(c) && c.close > middle(a) && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'bearish-abandoned-baby', name: 'Bearish Abandoned Baby', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 102.4, 99.3, 102.2), b(103.4, 103.8, 103, 103.38), b(102.4, 102.6, 99.6, 99.8)],
    identify: ['1: long rising candle', '2: a doji that gaps completely above candle 1 (wicks don\'t touch)', '3: falling candle that gaps completely below the doji'],
    meaning: 'The doji is "abandoned" between two gaps - a rare, sharp top.',
    confirm: 'Already strong; price staying below the second gap confirms it.',
    watchOut: 'True gaps on both sides are rare in liquid stocks, so real examples are uncommon.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && isDoji(m) && m.low > a.high && m.low > c.high && falling(c) && c.close < middle(a) && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'three-outside-up', name: 'Three Outside Up', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(99.5, 99.8, 97.8, 98), b(97.6, 100.4, 97.4, 100.2), b(100.2, 101.6, 100, 101.4)],
    identify: ['1 and 2 form a Bullish Engulfing', '3: rising candle closing above candle 2'],
    meaning: 'A Bullish Engulfing that has been confirmed by the next day.',
    confirm: 'Already includes confirmation.',
    watchOut: 'The entry is late, so the stop below the pattern is wide.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && rising(m) && m.open <= a.close && m.close >= a.open && body(m) > body(a) && rising(c) && c.close > m.close && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'three-outside-down', name: 'Three Outside Down', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(100.5, 102.2, 100.2, 102), b(102.4, 102.6, 99.6, 99.8), b(99.8, 100, 98.4, 98.6)],
    identify: ['1 and 2 form a Bearish Engulfing', '3: falling candle closing below candle 2'],
    meaning: 'A Bearish Engulfing that has been confirmed by the next day.',
    confirm: 'Already includes confirmation.',
    watchOut: 'The entry is late, so the stop above the pattern is wide.',
    reliability: 'High',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && falling(m) && m.open >= a.close && m.close <= a.open && body(m) > body(a) && falling(c) && c.close < m.close && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'advance-block', name: 'Advance Block', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99, 101.6, 98.9, 101.4), b(100.8, 102.8, 100.6, 102.4), b(102, 104, 101.9, 102.8)],
    identify: ['Three rising candles with higher closes', 'Each body is smaller than the last', 'Upper wicks get longer'],
    meaning: 'Like Three White Soldiers that are running out of breath - buyers keep getting pushed back.',
    confirm: 'A falling candle closing below the third candle\'s open.',
    watchOut: 'Usually signals a pause; full reversals are less common.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return [a, m, c].every(rising) && m.close > a.close && c.close > m.close && m.open >= a.open && m.open <= a.close && c.open >= m.open && c.open <= m.close
        && body(m) < body(a) && body(c) < body(m) && upper(c) > upper(a) && upper(c) >= body(c) * 0.5 && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'upside-tasuki-gap', name: 'Upside Tasuki Gap', signal: 'bullish', kind: 'Continuation', family: 'Three candles', trend: 'up',
    example: [b(99, 101.2, 98.8, 101), b(101.6, 103, 101.5, 102.8), b(102.2, 102.4, 101.2, 101.3)],
    identify: ['1: rising candle', '2: rising candle that gaps up', '3: falling candle that opens inside candle 2 and closes inside the gap, without closing it'],
    meaning: 'Profit-taking that fails to fill the gap - the uptrend is intact.',
    confirm: 'A close above candle 2\'s high.',
    watchOut: 'If price closes the gap completely, the pattern has failed.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && rising(m) && bottom(m) > top(a) && falling(c) && c.open <= m.close && c.open >= m.open && c.close < bottom(m) && c.close > top(a) && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'downside-tasuki-gap', name: 'Downside Tasuki Gap', signal: 'bearish', kind: 'Continuation', family: 'Three candles', trend: 'down',
    example: [b(101, 101.2, 98.8, 99), b(98.4, 98.5, 97, 97.2), b(97.8, 98.8, 97.6, 98.7)],
    identify: ['1: falling candle', '2: falling candle that gaps down', '3: rising candle that opens inside candle 2 and closes inside the gap, without closing it'],
    meaning: 'A relief bounce that fails to fill the gap - the downtrend is intact.',
    confirm: 'A close below candle 2\'s low.',
    watchOut: 'If price closes the gap completely, the pattern has failed.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && falling(m) && top(m) < bottom(a) && rising(c) && c.open <= m.open && c.open >= m.close && c.close > top(m) && c.close < bottom(a) && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'upside-gap-two-crows', name: 'Upside Gap Two Crows', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(104, 104.3, 103.3, 103.5), b(104.3, 104.5, 103.1, 103.2)],
    identify: ['1: long rising candle', '2: small falling candle that gaps up', '3: falling candle that opens above candle 2 and closes below it, but still above candle 1'],
    meaning: 'Two failed attempts to hold the gap up - momentum is draining.',
    confirm: 'A close below candle 1\'s close (into the gap).',
    watchOut: 'Uncommon and only moderately reliable.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && falling(m) && bottom(m) > a.close && falling(c) && c.open > m.open && c.close < m.close && c.close > a.close && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'two-crows', name: 'Two Crows', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(99.5, 103, 99.3, 102.8), b(104, 104.3, 103.3, 103.5), b(103.8, 104, 100.8, 101)],
    identify: ['1: long rising candle', '2: falling candle that gaps up', '3: falling candle that opens inside candle 2 and closes inside candle 1\'s body'],
    meaning: 'The gap up is erased and sellers push deep into the prior rally.',
    confirm: 'A close below candle 1\'s open.',
    watchOut: 'Uncommon; wait for confirmation.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return rising(a) && isLong(bars, i - 2) && falling(m) && bottom(m) > a.close && falling(c) && c.open <= m.open && c.open >= m.close && c.close < a.close && c.close > a.open && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'stick-sandwich', name: 'Stick Sandwich', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(100.5, 100.7, 98, 98.2), b(98.6, 100.8, 98.4, 100.6), b(101, 101.2, 98, 98.2)],
    identify: ['1: falling candle', '2: rising candle closing above candle 1\'s open', '3: falling candle closing at the same price as candle 1'],
    meaning: 'Two closes at the same level, separated by a rally - that price is acting as support.',
    confirm: 'A rising candle after the sandwich.',
    watchOut: 'Rare; equal closes alone are a weak reason to buy.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return falling(a) && rising(m) && m.close > a.open && falling(c) && Math.abs(c.close - a.close) <= range(a) * 0.05 && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'bullish-tri-star', name: 'Bullish Tri-Star', signal: 'bullish', kind: 'Reversal', family: 'Three candles', trend: 'down',
    example: [b(98, 98.6, 97.4, 98.05), b(96.8, 97.3, 96.2, 96.85), b(97.6, 98.2, 97, 97.65)],
    identify: ['Three dojis in a row', 'The middle doji sits below the other two', 'Appears after a decline'],
    meaning: 'Three days of complete indecision at a low - the selling has dried up.',
    confirm: 'A rising candle closing above the third doji\'s high.',
    watchOut: 'Very rare; several dojis in a row are more often just a quiet market.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return [a, m, c].every(isDoji) && top(m) < bottom(a) && top(m) < bottom(c) && trendBefore(bars, i - 2) === 'down';
    },
  },
  {
    id: 'bearish-tri-star', name: 'Bearish Tri-Star', signal: 'bearish', kind: 'Reversal', family: 'Three candles', trend: 'up',
    example: [b(102, 102.6, 101.4, 102.05), b(103.2, 103.8, 102.7, 103.25), b(102.4, 103, 101.8, 102.45)],
    identify: ['Three dojis in a row', 'The middle doji sits above the other two', 'Appears after a rally'],
    meaning: 'Three days of complete indecision at a high - the buying has dried up.',
    confirm: 'A falling candle closing below the third doji\'s low.',
    watchOut: 'Very rare; several dojis in a row are more often just a quiet market.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 2) return false;
      const [a, m, c] = [bars[i - 2], bars[i - 1], bars[i]];
      return [a, m, c].every(isDoji) && bottom(m) > top(a) && bottom(m) > top(c) && trendBefore(bars, i - 2) === 'up';
    },
  },
  {
    id: 'bullish-three-line-strike', name: 'Bullish Three-Line Strike', signal: 'bullish', kind: 'Continuation', family: 'Four candles', trend: 'up',
    example: [b(98, 99.6, 97.9, 99.4), b(99, 100.8, 98.8, 100.6), b(100.2, 102, 100, 101.8), b(102.2, 102.4, 97.6, 97.8)],
    identify: ['Three rising candles with higher closes', '4: one falling candle that opens above the third close and closes below the first open'],
    meaning: 'One sharp shakeout wipes out three days of gains; textbooks treat it as a pause in the uptrend.',
    confirm: 'Price recovering above the fourth candle\'s midpoint.',
    watchOut: 'Studies of real charts often find it resolves downward instead - treat the direction with caution.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 3) return false;
      const [a, m, c, d] = bars.slice(i - 3, i + 1);
      return [a, m, c].every(rising) && m.close > a.close && c.close > m.close && falling(d) && d.open >= c.close && d.close <= a.open;
    },
  },
  {
    id: 'bearish-three-line-strike', name: 'Bearish Three-Line Strike', signal: 'bearish', kind: 'Continuation', family: 'Four candles', trend: 'down',
    example: [b(102, 102.1, 100.4, 100.6), b(101, 101.2, 99.2, 99.4), b(99.8, 100, 98, 98.2), b(97.8, 102.4, 97.6, 102.2)],
    identify: ['Three falling candles with lower closes', '4: one rising candle that opens below the third close and closes above the first open'],
    meaning: 'One sharp squeeze wipes out three days of losses; textbooks treat it as a pause in the downtrend.',
    confirm: 'Price falling back below the fourth candle\'s midpoint.',
    watchOut: 'Studies of real charts often find it resolves upward instead - treat the direction with caution.',
    reliability: 'Low',
    detect: (bars, i) => {
      if (i < 3) return false;
      const [a, m, c, d] = bars.slice(i - 3, i + 1);
      return [a, m, c].every(falling) && m.close < a.close && c.close < m.close && rising(d) && d.open <= c.close && d.close >= a.open;
    },
  },
  {
    id: 'mat-hold', name: 'Mat Hold', signal: 'bullish', kind: 'Continuation', family: 'Five candles', trend: 'up',
    example: [b(99, 102.7, 98.8, 102.5), b(103.2, 103.4, 102.6, 102.8), b(102.8, 103, 102, 102.3), b(102.3, 102.5, 101.6, 101.9), b(102.2, 104.6, 102, 104.4)],
    identify: ['1: long rising candle', '2: small candle that gaps up', '3-4: small candles drifting lower, staying above candle 1\'s open', '5: rising candle closing above the pause\'s high'],
    meaning: 'A shallow, orderly pullback after a gap - buyers hold the ground and push on.',
    confirm: 'Candle 5 on rising volume.',
    watchOut: 'A deeper pullback that falls into candle 1\'s lower half weakens it.',
    reliability: 'Medium',
    detect: (bars, i) => {
      if (i < 4) return false;
      const [a, x, y, z, e] = bars.slice(i - 4, i + 1);
      const pause = [x, y, z];
      return rising(a) && isLong(bars, i - 4) && bottom(x) > a.close && pause.every(bar => body(bar) < body(a) * 0.5 && Math.min(bar.open, bar.close) > a.open)
        && z.close < x.close && rising(e) && e.close > Math.max(...pause.map(bar => bar.high));
    },
  },
];

export const patternSize = (pattern: CandlestickPattern) => pattern.example.length;

// Four lead-in candles before an example so the drawing shows the trend the pattern needs.
export const exampleWithContext = (pattern: CandlestickPattern): Bar[] => {
  const first = pattern.example[0];
  const anchor = pattern.trend === 'up' ? Math.min(first.open, first.close) : Math.max(first.open, first.close);
  const lead = [0, 1, 2, 3].map(n => {
    if (pattern.trend === 'down') { const close = anchor + 1.1 * (3 - n) + 0.6; return b(close + 1, close + 1.3, close - 0.3, close); }
    if (pattern.trend === 'up') { const close = anchor - 1.1 * (3 - n) - 0.6; return b(close - 1, close + 0.3, close - 1.3, close); }
    const close = anchor + (n % 2 ? 0.3 : -0.3); return b(close + (n % 2 ? -0.8 : 0.8), close + 1.2, close - 1.2, close);
  });
  return [...lead, ...pattern.example];
};

export interface PatternMatch { patternId: string; index: number; start: number }

// Every pattern found in `bars`, keyed by the candle that completes it, latest first.
export const findPatterns = (bars: Bar[], patterns: CandlestickPattern[] = CANDLESTICK_PATTERNS): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    for (const pattern of patterns) {
      const start = index - patternSize(pattern) + 1;
      if (start >= 0 && pattern.detect(bars, index)) matches.push({ patternId: pattern.id, index, start });
    }
  }
  return matches;
};
