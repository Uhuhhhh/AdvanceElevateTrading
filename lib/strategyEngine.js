// ===============================
// ELEVATE AI SIGNAL ENGINE
// ORIGINAL STRATEGY
// ===============================

// EMA
function calculateEMA(prices, period){

    const k = 2 / (period + 1);

    let ema = prices[0];

    for(let i = 1; i < prices.length; i++){

        ema = prices[i] * k + ema * (1 - k);

    }

    return ema;

}

// RSI
function calculateRSI(prices, period = 14){

    let gain = 0;
    let loss = 0;

    for(let i = prices.length - period; i < prices.length; i++){

        const diff = prices[i] - prices[i-1];

        if(diff > 0){

            gain += diff;

        }else{

            loss += Math.abs(diff);

        }

    }

    if(loss === 0) return 100;

    const rs = gain / loss;

    return 100 - (100 / (1 + rs));

}

// ATR
function calculateATR(candles, period = 14){

    let tr = [];

    for(let i = 1; i < candles.length; i++){

        const high = parseFloat(candles[i].high);

        const low = parseFloat(candles[i].low);

        const prevClose = parseFloat(candles[i-1].close);

        tr.push(

            Math.max(

                high-low,

                Math.abs(high-prevClose),

                Math.abs(low-prevClose)

            )

        );

    }

    let atr = 0;

    for(let i = tr.length-period; i < tr.length; i++){

        atr += tr[i];

    }

    return atr / period;

}

// Trend
function detectTrend(ema20, ema50, ema200){

    if(

        ema20 > ema50 &&
        ema50 > ema200

    ){

        return "STRONG UP";

    }

    if(

        ema20 < ema50 &&
        ema50 < ema200

    ){

        return "STRONG DOWN";

    }

    if(ema20 > ema50){

        return "UP";

    }

    if(ema20 < ema50){

        return "DOWN";

    }

    return "SIDEWAYS";

}

// ATR QUALITY
function getATRQuality(atr){

    if(atr < 0.00030){

        return "LOW";

    }

    if(atr < 0.00120){

        return "GOOD";

    }

    return "HIGH";

}

// ENTRY & EXPIRY
function getTradeTime(tf){

    const now = new Date(
    new Date().toLocaleString(
        "en-US",
        {
            timeZone: "Asia/Kolkata"
        }
    )
);

    const entry = new Date(now);

    entry.setMinutes(entry.getMinutes()+1);

    entry.setSeconds(0);

    const expiry = new Date(entry);

    expiry.setMinutes(expiry.getMinutes()+tf);

    function f(v){

        return String(v).padStart(2,"0");

    }

    return{

        entry:
        `${f(entry.getHours())}:${f(entry.getMinutes())}`,

        expiry:
        `${f(expiry.getHours())}:${f(expiry.getMinutes())}`

    };

}

function analyzeMarket(candles, timeframe, market){

    const closes = candles.map(c => parseFloat(c.close));

    const opens = candles.map(c => parseFloat(c.open));

    // ===== ORIGINAL LOGIC =====

    const ema20 = calculateEMA(closes,20);

    const ema50 = calculateEMA(closes,50);

    const ema200 = calculateEMA(closes,200);

    const rsi = calculateRSI(closes);

    const atr = calculateATR(candles);

    const trend = detectTrend(

        ema20,

        ema50,

        ema200

    );

    const atrStatus = getATRQuality(atr);

    const tradeTime = getTradeTime(
        parseInt(timeframe)
    );

    const PATTERN_SIZE = 5;

    const EXPIRY = parseInt(timeframe);

    if(closes.length < 100){

        return{

            success:false,

            message:"NO DATA"

        };

    }

    let currentPattern = [];

    for(

        let i = closes.length - PATTERN_SIZE;

        i < closes.length;

        i++

    ){

        currentPattern.push(

            closes[i] > opens[i] ? 1 : 0

        );

    }

    let matches = 0;

    let callWins = 0;

    let putWins = 0;

    let historicalResults = [];
    // ===============================
// HISTORICAL PATTERN ENGINE
// ===============================

for(let i=PATTERN_SIZE;i<closes.length-EXPIRY-1;i++){

    let same = true;

    for(let j=0;j<PATTERN_SIZE;j++){

        const a =
        closes[i-PATTERN_SIZE+j] >
        opens[i-PATTERN_SIZE+j] ? 1 : 0;

        if(a !== currentPattern[j]){

            same = false;

            break;

        }

    }

    if(!same) continue;

    matches++;

    const entryPrice = closes[i];

    const expiryPrice = closes[i+EXPIRY];

    if(expiryPrice > entryPrice){

        callWins++;

        historicalResults.push("CALL");

    }
    else if(expiryPrice < entryPrice){

        putWins++;

        historicalResults.push("PUT");

    }

}

const callRate =
matches ?
(callWins/matches)*100 : 0;

const putRate =
matches ?
(putWins/matches)*100 : 0;

const historicalWinRate =
Math.max(callRate, putRate);

if(historicalWinRate < 60){

    return{

        success:false,

        message:"Pattern Win Rate Too Low",

        historicalWinRate

    };

}

const historicalDirection =
callRate >= putRate ?
"CALL" : "PUT";
// ===============================
// HISTORICAL SCORE
// ===============================

let historicalScore = 0;

// Pattern Win Rate
if(historicalWinRate >= 90)
    historicalScore += 35;
else if(historicalWinRate >= 80)
    historicalScore += 30;
else if(historicalWinRate >= 70)
    historicalScore += 20;

// Pattern Matches
if(matches >= 20)
    historicalScore += 20;
else if(matches >= 15)
    historicalScore += 15;
else if(matches >= 10)
    historicalScore += 10;

// Trend
if(
    (historicalDirection=="CALL" && trend.includes("UP")) ||
    (historicalDirection=="PUT" && trend.includes("DOWN"))
){
    historicalScore += 20;
}

// RSI
if(
    (historicalDirection=="CALL" && rsi>=55 && rsi<=70) ||
    (historicalDirection=="PUT" && rsi<=45 && rsi>=30)
){
    historicalScore += 15;
}

// ATR
if(atrStatus=="GOOD")
    historicalScore += 10;

if(historicalScore > 100)
    historicalScore = 100;

// ===============================
// CONFIDENCE LABEL
// ===============================

let confidence = "LOW";

if(historicalScore >= 90)
    confidence = "VERY HIGH";
else if(historicalScore >= 80)
    confidence = "HIGH";
else if(historicalScore >= 70)
    confidence = "MEDIUM";

// ===============================
// PREVIOUS HISTORICAL RESULTS
// ===============================

const previous3 =
historicalResults
.slice(-3)
.reverse();

let previousResult = "--";

if(previous3.length){

    const callCount =
    previous3.filter(x=>x=="CALL").length;

    const putCount =
    previous3.filter(x=>x=="PUT").length;

    if(callCount >= putCount)
        previousResult = `CALL ${callCount}/3`;
    else
        previousResult = `PUT ${putCount}/3`;

}

// ===============================
// MINIMUM MATCHES
// ===============================

if(matches < 10){

    return{

        success:false,

        message:"Historical data is insufficient.",

        matches

    };

}

// ===============================
// RETURN RESULT
// ===============================

return{

    success:true,

    pair:market,

    signal:historicalDirection,

    confidence:historicalScore,

    confidenceLabel:confidence,

    trend,

    matches,

    historicalWinRate,

    previousResult,

    entry:tradeTime.entry,

    expiry:tradeTime.expiry,
    
    entryPrice: closes[closes.length - 1],

    atrStatus,

    rsi

};

}

module.exports = {

    analyzeMarket

};