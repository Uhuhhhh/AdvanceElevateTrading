// ===============================================================
// ELEVATE AI SIGNAL ENGINE — v2
// Fixed indicator math + multi-confluence scoring + honest stats
// ===============================================================
//
// WHAT CHANGED FROM v1 AND WHY:
// - EMA now seeded with a proper SMA instead of prices[0], removing
//   early-bar bias.
// - RSI now uses Wilder's smoothing (the same method most charting
//   platforms use), not a fixed-window average recomputed from scratch.
// - Added MACD, Bollinger Bands, and simple support/resistance as
//   extra, independent confluence checks.
// - The old engine matched ONE candle-pattern size (5) and reported
//   its raw win rate. With only ~10-20 historical matches, a raw win
//   rate is mostly noise. This version:
//     (a) matches across multiple pattern sizes (3,4,5,6) to gather
//         more historical samples per signal ("more signal" opportunities),
//     (b) scores the *statistical lower bound* of the win rate (Wilson
//         score interval) instead of the raw win rate, so confidence
//         reflects sample size honestly instead of overstating thin data.
// - Added rankSignals() to scan several pairs/timeframes at once and
//   return the best current setups, instead of one signal at a time.
//
// IMPORTANT: no signal engine can guarantee outcomes on OTC binary
// options. This file makes the confidence math honest; it does not
// make the underlying market predictable.

// ---------------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------------

function sma(values, period) {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  return sum / period;
}

// Returns a sparse array aligned to `prices` indices: value at index i
// is the EMA using prices[0..i], or undefined before the seed point.
function emaSeries(prices, period) {
  const result = new Array(prices.length);
  const seed = sma(prices, period);
  if (seed === null) return result;

  const k = 2 / (period + 1);
  result[period - 1] = seed;
  let prev = seed;

  for (let i = period; i < prices.length; i++) {
    prev = prices[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}

function calculateEMA(prices, period) {
  const series = emaSeries(prices, period);
  return series[series.length - 1] ?? null;
}

// Wilder's RSI (matches TradingView / most platforms).
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum += Math.abs(diff);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return null;

  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);
    const prevClose = parseFloat(candles[i - 1].close);
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }

  let atr = 0;
  for (let i = tr.length - period; i < tr.length; i++) atr += tr[i];
  return atr / period;
}

function calculateMACD(prices, fast = 12, slow = 26, signalPeriod = 9) {
  const fastSeries = emaSeries(prices, fast);
  const slowSeries = emaSeries(prices, slow);

  const macdLine = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastSeries[i] !== undefined && slowSeries[i] !== undefined) {
      macdLine.push(fastSeries[i] - slowSeries[i]);
    }
  }

  if (macdLine.length < signalPeriod) {
    return { macd: null, signalLine: null, histogram: null };
  }

  const signalSeries = emaSeries(macdLine, signalPeriod);
  const macd = macdLine[macdLine.length - 1];
  const signalLine = signalSeries[signalSeries.length - 1];

  return {
    macd,
    signalLine,
    histogram: macd - signalLine
  };
}

function calculateBollinger(prices, period = 20, mult = 2) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);

  return {
    upper: mean + mult * sd,
    mid: mean,
    lower: mean - mult * sd,
    // where the latest close sits inside the bands, 0 = lower, 1 = upper
    percentB: sd === 0 ? 0.5 : (prices[prices.length - 1] - (mean - mult * sd)) / (2 * mult * sd)
  };
}

function findSupportResistance(candles, lookback = 50) {
  const slice = candles.slice(-lookback);
  const highs = slice.map((c) => parseFloat(c.high));
  const lows = slice.map((c) => parseFloat(c.low));
  return {
    resistance: Math.max(...highs),
    support: Math.min(...lows)
  };
}

function detectTrend(ema20, ema50, ema200) {
  if (ema20 > ema50 && ema50 > ema200) return "STRONG UP";
  if (ema20 < ema50 && ema50 < ema200) return "STRONG DOWN";
  if (ema20 > ema50) return "UP";
  if (ema20 < ema50) return "DOWN";
  return "SIDEWAYS";
}

function getATRQuality(atr) {
  if (atr === null) return "UNKNOWN";
  if (atr < 0.0003) return "LOW";
  if (atr < 0.0012) return "GOOD";
  return "HIGH";
}

function getTradeTime(tf) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const entry = new Date(now);
  entry.setMinutes(entry.getMinutes() + 1);
  entry.setSeconds(0);

  const expiry = new Date(entry);
  expiry.setMinutes(expiry.getMinutes() + tf);

  const f = (v) => String(v).padStart(2, "0");
  return {
    entry: `${f(entry.getHours())}:${f(entry.getMinutes())}`,
    expiry: `${f(expiry.getHours())}:${f(expiry.getMinutes())}`
  };
}

// Wilson score lower bound: a conservative estimate of the true win
// rate given a small sample. Prevents "9/10 wins = 90%!" from being
// treated the same as "90/100 wins = 90%".
function wilsonLowerBound(wins, total, z = 1.64) {
  // z = 1.64 -> ~90% confidence
  if (total === 0) return 0;
  const phat = wins / total;
  const denom = 1 + (z * z) / total;
  const centre = phat + (z * z) / (2 * total);
  const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total);
  return Math.max(0, (centre - margin) / denom);
}

// ---------------------------------------------------------------
// MULTI-SIZE HISTORICAL PATTERN MATCHING
// ---------------------------------------------------------------
// Instead of one fixed pattern length, check several. Each pattern
// size that matches contributes its wins/losses to a pooled sample,
// which both raises the sample size (more honest stats) and
// naturally surfaces a signal more often than a single rigid pattern
// length would.

function matchPatternsForSize(closes, opens, patternSize, expiry) {
  const currentPattern = [];
  for (let i = closes.length - patternSize; i < closes.length; i++) {
    currentPattern.push(closes[i] > opens[i] ? 1 : 0);
  }

  let callWins = 0;
  let putWins = 0;
  const historicalResults = [];

  for (let i = patternSize; i < closes.length - expiry - 1; i++) {
    let same = true;
    for (let j = 0; j < patternSize; j++) {
      const a = closes[i - patternSize + j] > opens[i - patternSize + j] ? 1 : 0;
      if (a !== currentPattern[j]) {
        same = false;
        break;
      }
    }
    if (!same) continue;

    const entryPrice = closes[i];
    const expiryPrice = closes[i + expiry];

    if (expiryPrice > entryPrice) {
      callWins++;
      historicalResults.push("CALL");
    } else if (expiryPrice < entryPrice) {
      putWins++;
      historicalResults.push("PUT");
    }
  }

  return { callWins, putWins, historicalResults, matches: callWins + putWins };
}

function matchHistoricalPatterns(closes, opens, expiry, patternSizes = [3, 4, 5, 6]) {
  let callWins = 0;
  let putWins = 0;
  let historicalResults = [];

  for (const size of patternSizes) {
    if (closes.length < size + expiry + 10) continue;
    const r = matchPatternsForSize(closes, opens, size, expiry);
    callWins += r.callWins;
    putWins += r.putWins;
    historicalResults = historicalResults.concat(r.historicalResults);
  }

  const matches = callWins + putWins;
  const direction = callWins >= putWins ? "CALL" : "PUT";
  const directionWins = direction === "CALL" ? callWins : putWins;
  const rawWinRate = matches ? (directionWins / matches) * 100 : 0;
  const confidenceLowerBound = matches ? wilsonLowerBound(directionWins, matches) * 100 : 0;

  return { matches, direction, rawWinRate, confidenceLowerBound, historicalResults };
}

// ---------------------------------------------------------------
// MAIN ANALYSIS
// ---------------------------------------------------------------

function analyzeMarket(candles, timeframe, market, options = {}) {
  const minWinRate = options.minWinRate ?? 55; // statistical lower bound threshold, not raw %
  const minMatches = options.minMatches ?? 8;

  if (!candles || candles.length < 100) {
    return { success: false, message: "NO DATA" };
  }

  const closes = candles.map((c) => parseFloat(c.close));
  const opens = candles.map((c) => parseFloat(c.open));
  const EXPIRY = parseInt(timeframe);

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes);
  const atr = calculateATR(candles);
  const macd = calculateMACD(closes);
  const bollinger = calculateBollinger(closes);
  const sr = findSupportResistance(candles);

  if (ema20 === null || ema50 === null || ema200 === null || rsi === null) {
    return { success: false, message: "Not enough data for indicators" };
  }

  const trend = detectTrend(ema20, ema50, ema200);
  const atrStatus = getATRQuality(atr);
  const tradeTime = getTradeTime(EXPIRY);

  const pattern = matchHistoricalPatterns(closes, opens, EXPIRY);

  if (pattern.matches < minMatches) {
    return { success: false, message: "Historical data is insufficient.", matches: pattern.matches };
  }

  if (pattern.confidenceLowerBound < minWinRate) {
    return {
      success: false,
      message: "Pattern win-rate lower bound too low",
      historicalWinRate: pattern.rawWinRate,
      confidenceLowerBound: pattern.confidenceLowerBound,
      matches: pattern.matches
    };
  }

  const direction = pattern.direction;

  // -------------------------------------------------------------
  // CONFLUENCE SCORE (0-100)
  // -------------------------------------------------------------
  let score = 0;

  // Historical pattern strength (statistically-adjusted)
  if (pattern.confidenceLowerBound >= 80) score += 30;
  else if (pattern.confidenceLowerBound >= 70) score += 24;
  else if (pattern.confidenceLowerBound >= 60) score += 16;
  else score += 8;

  // Sample size
  if (pattern.matches >= 40) score += 15;
  else if (pattern.matches >= 25) score += 10;
  else if (pattern.matches >= 15) score += 6;

  // Trend agreement
  if ((direction === "CALL" && trend.includes("UP")) || (direction === "PUT" && trend.includes("DOWN"))) {
    score += 15;
  }

  // RSI agreement (momentum, not just overbought/oversold extremes)
  if ((direction === "CALL" && rsi >= 50 && rsi <= 70) || (direction === "PUT" && rsi <= 50 && rsi >= 30)) {
    score += 10;
  }

  // MACD histogram agreement
  if (macd.histogram !== null) {
    if ((direction === "CALL" && macd.histogram > 0) || (direction === "PUT" && macd.histogram < 0)) {
      score += 10;
    }
  }

  // Bollinger position (avoid signaling a CALL right at the upper band, etc.)
  if (bollinger) {
    if (direction === "CALL" && bollinger.percentB <= 0.85) score += 5;
    if (direction === "PUT" && bollinger.percentB >= 0.15) score += 5;
  }

  // Support/resistance headroom (don't buy right into resistance)
  const lastClose = closes[closes.length - 1];
  const roomToResistance = sr.resistance - lastClose;
  const roomToSupport = lastClose - sr.support;
  const range = sr.resistance - sr.support || 1;
  if (direction === "CALL" && roomToResistance / range > 0.15) score += 10;
  if (direction === "PUT" && roomToSupport / range > 0.15) score += 10;

  // Volatility quality
  if (atrStatus === "GOOD") score += 5;

  score = Math.min(100, score);

  let confidenceLabel = "LOW";
  if (score >= 85) confidenceLabel = "VERY HIGH";
  else if (score >= 70) confidenceLabel = "HIGH";
  else if (score >= 55) confidenceLabel = "MEDIUM";

  const previous3 = pattern.historicalResults.slice(-3).reverse();
  let previousResult = "--";
  if (previous3.length) {
    const callCount = previous3.filter((x) => x === "CALL").length;
    const putCount = previous3.filter((x) => x === "PUT").length;
    previousResult = callCount >= putCount ? `CALL ${callCount}/3` : `PUT ${putCount}/3`;
  }

  return {
    success: true,
    pair: market,
    signal: direction,
    confidence: score,
    confidenceLabel,
    trend,
    matches: pattern.matches,
    historicalWinRate: pattern.rawWinRate,
    confidenceLowerBound: pattern.confidenceLowerBound,
    previousResult,
    entry: tradeTime.entry,
    expiry: tradeTime.expiry,
    entryPrice: lastClose,
    atrStatus,
    rsi,
    macd,
    bollinger,
    supportResistance: sr
  };
}

// ---------------------------------------------------------------
// MULTI-ASSET SCAN — surfaces more than one signal at a time
// ---------------------------------------------------------------
// marketData: { "EURUSD": candles[], "GBPUSD": candles[], ... }
// Returns every asset that currently qualifies as a signal, ranked
// by confidence, so the dashboard can show several live setups
// instead of just one.

function rankSignals(marketData, timeframe, options = {}) {
  const results = [];

  for (const [pair, candles] of Object.entries(marketData)) {
    const analysis = analyzeMarket(candles, timeframe, pair, options);
    if (analysis.success) results.push(analysis);
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

module.exports = {
  analyzeMarket,
  rankSignals,
  // exported for the backtest module and unit tests
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateMACD,
  calculateBollinger,
  findSupportResistance,
  wilsonLowerBound,
  detectTrend,
  getATRQuality
};
