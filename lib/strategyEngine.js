// =======================================================
// ELEVATE AI V30
// PART 1
// CORE ENGINE + HISTORICAL MATCHING
// =======================================================

function num(v){
    return parseFloat(v);
}

function closeArray(candles){
    return candles.map(c=>num(c.close));
}

function openArray(candles){
    return candles.map(c=>num(c.open));
}

function highArray(candles){
    return candles.map(c=>num(c.high));
}

function lowArray(candles){
    return candles.map(c=>num(c.low));
}

// =========================================
// ENTRY / EXPIRY
// =========================================

function getTradeTime(tf){

    const now = new Date(
        new Date().toLocaleString(
            "en-US",
            { timeZone:"Asia/Kolkata" }
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

// =========================================
// VOLATILITY
// =========================================

function averageRange(candles, period=20){

    let total=0;

    for(let i=candles.length-period;i<candles.length;i++){

        total +=
        Math.abs(
            num(candles[i].high)-
            num(candles[i].low)
        );

    }

    return total/period;

}

// =========================================
// SIMPLE TREND
// =========================================

function detectTrend(closes){

    const last=closes.length-1;

    const recent=
    closes[last]-closes[last-20];

    if(recent>0)
        return "UP";

    if(recent<0)
        return "DOWN";

    return "SIDEWAYS";

}

// =========================================
// BUILD LAST 20 CANDLE FINGERPRINT
// =========================================

function buildFingerprint(candles,size=20){

    let fp=[];

    for(let i=candles.length-size;i<candles.length;i++){

        const o=num(candles[i].open);

        const h=num(candles[i].high);

        const l=num(candles[i].low);

        const c=num(candles[i].close);

        fp.push({

            body:c-o,

            upper:h-Math.max(o,c),

            lower:Math.min(o,c)-l,

            bull:c>o?1:0

        });

    }

    return fp;

}

// =========================================
// HISTORICAL SIMILARITY
// =========================================

function historicalSimilarity(
    candles,
    timeframe
){

    const closes=closeArray(candles);

    const current=
    buildFingerprint(candles,20);

    let matches=[];

    for(
        let i=20;
        i<candles.length-timeframe-1;
        i++
    ){

        let score=0;

        for(let j=0;j<20;j++){

            const c=candles[i-20+j];

            const o=num(c.open);

            const h=num(c.high);

            const l=num(c.low);

            const cl=num(c.close);

            const bull=
            cl>o?1:0;

            if(
                bull==
                current[j].bull
            ){

                score++;

            }

            if(
                Math.abs(
                    (cl-o)-
                    current[j].body
                )<
                averageRange(candles)*0.25
            ){

                score++;

            }

        }

        const similarity=
        (score/40)*100;

        if(similarity<75)
            continue;

        const entry=
        closes[i];

        const expiry=
        closes[i+timeframe];

        matches.push({

            similarity,

            direction:
            expiry>entry?
            "CALL":"PUT"

        });

    }

    return matches;

}

// =========================================
// CONFIDENCE
// =========================================

function similarityScore(matches){

    if(matches.length===0){

        return{

            direction:null,

            winRate:0,

            confidence:0,

            matches:0

        };

    }

    let call=0;
    let put=0;

    matches.forEach(x=>{

        if(x.direction==="CALL")
            call++;
        else
            put++;

    });

    const total=
    matches.length;

    const direction=
    call>=put?
    "CALL":"PUT";

    const wins=
    Math.max(call,put);

    const winRate=
    (wins/total)*100;

    return{

        direction,

        winRate,

        confidence:
        Math.round(winRate),

        matches:total

    };

}
// =======================================================
// ELEVATE AI V30
// PART 2
// SMART PRICE ACTION ENGINE
// =======================================================

// =========================================
// SWING HIGH / LOW
// =========================================

function getSwingHigh(candles, left = 2, right = 2){

    let swings = [];

    for(let i = left; i < candles.length-right; i++){

        const high = num(candles[i].high);

        let valid = true;

        for(let j = 1; j <= left; j++){

            if(high <= num(candles[i-j].high)){
                valid = false;
                break;
            }

        }

        if(!valid) continue;

        for(let j = 1; j <= right; j++){

            if(high <= num(candles[i+j].high)){
                valid = false;
                break;
            }

        }

        if(valid){

            swings.push({
                index:i,
                price:high
            });

        }

    }

    return swings;

}

function getSwingLow(candles, left = 2, right = 2){

    let swings = [];

    for(let i = left; i < candles.length-right; i++){

        const low = num(candles[i].low);

        let valid = true;

        for(let j = 1; j <= left; j++){

            if(low >= num(candles[i-j].low)){
                valid = false;
                break;
            }

        }

        if(!valid) continue;

        for(let j = 1; j <= right; j++){

            if(low >= num(candles[i+j].low)){
                valid = false;
                break;
            }

        }

        if(valid){

            swings.push({
                index:i,
                price:low
            });

        }

    }

    return swings;

}

// =========================================
// MARKET STRUCTURE
// =========================================

function detectMarketStructure(candles){

    const highs = getSwingHigh(candles);
    const lows  = getSwingLow(candles);

    let hh = 0;
    let lh = 0;
    let hl = 0;
    let ll = 0;

    for(let i=1;i<highs.length;i++){

        if(highs[i].price > highs[i-1].price)
            hh++;
        else
            lh++;

    }

    for(let i=1;i<lows.length;i++){

        if(lows[i].price > lows[i-1].price)
            hl++;
        else
            ll++;

    }

    let trend="SIDEWAYS";

    if(hh>lh && hl>ll)
        trend="UP";

    if(lh>hh && ll>hl)
        trend="DOWN";

    return{

        trend,
        hh,
        hl,
        lh,
        ll

    };

}

// =========================================
// BREAK OF STRUCTURE
// =========================================

function detectBOS(candles){

    const highs=getSwingHigh(candles);
    const lows=getSwingLow(candles);

    if(highs.length<2 || lows.length<2){

        return{

            bullish:false,
            bearish:false

        };

    }

    const lastClose=
    num(candles[candles.length-1].close);

    const previousHigh=
    highs[highs.length-1].price;

    const previousLow=
    lows[lows.length-1].price;

    return{

        bullish:lastClose>previousHigh,

        bearish:lastClose<previousLow

    };

}

// =========================================
// CHANGE OF CHARACTER
// =========================================

function detectCHOCH(candles){

    const structure=
    detectMarketStructure(candles);

    const bos=
    detectBOS(candles);

    let direction="NONE";

    if(structure.trend==="DOWN" && bos.bullish)
        direction="CALL";

    if(structure.trend==="UP" && bos.bearish)
        direction="PUT";

    return{

        direction,

        bullish:
        direction==="CALL",

        bearish:
        direction==="PUT"

    };

}

// =========================================
// LIQUIDITY SWEEP
// =========================================

function detectLiquiditySweep(candles){

    const last=
    candles[candles.length-1];

    const previous=
    candles[candles.length-2];

    const high=
    num(last.high);

    const low=
    num(last.low);

    const close=
    num(last.close);

    const prevHigh=
    num(previous.high);

    const prevLow=
    num(previous.low);

    let bullish=false;
    let bearish=false;

    if(low<prevLow && close>prevLow){

        bullish=true;

    }

    if(high>prevHigh && close<prevHigh){

        bearish=true;

    }

    return{

        bullish,

        bearish

    };

}

// =========================================
// SUPPORT / RESISTANCE
// =========================================

function detectSupportResistance(candles){

    const highs=
    getSwingHigh(candles);

    const lows=
    getSwingLow(candles);

    const lastClose=
    num(candles[candles.length-1].close);

    let support=false;
    let resistance=false;

    for(const l of lows){

        if(Math.abs(lastClose-l.price)<=averageRange(candles)){

            support=true;

        }

    }

    for(const h of highs){

        if(Math.abs(lastClose-h.price)<=averageRange(candles)){

            resistance=true;

        }

    }

    return{

        support,

        resistance

    };

}
// =======================================================
// ELEVATE AI V30
// PART 3
// CONFLUENCE ENGINE
// =======================================================

// =========================================
// TREND CONTINUATION
// =========================================

function detectTrendContinuation(candles){

    const closes = closeArray(candles);

    const trend = detectTrend(closes);

    const last = num(candles[candles.length-1].close);

    const previous = num(candles[candles.length-2].close);

    let signal = "NONE";

    if(trend=="UP" && last>previous)
        signal="CALL";

    if(trend=="DOWN" && last<previous)
        signal="PUT";

    return{

        trend,

        signal

    };

}

// =========================================
// CANDLE CLUSTER
// =========================================

function analyzeCluster(candles,size=5){

    let bulls=0;
    let bears=0;

    for(
        let i=candles.length-size;
        i<candles.length;
        i++
    ){

        if(
            num(candles[i].close)>
            num(candles[i].open)
        )
            bulls++;
        else
            bears++;

    }

    let direction="NONE";

    if(bulls>bears)
        direction="CALL";

    if(bears>bulls)
        direction="PUT";

    return{

        bulls,

        bears,

        direction

    };

}

// =========================================
// BUY / SELL PRESSURE
// =========================================

function tickPressure(candles){

    let buy=0;
    let sell=0;

    for(
        let i=candles.length-20;
        i<candles.length;
        i++
    ){

        const body=Math.abs(

            num(candles[i].close)-

            num(candles[i].open)

        );

        if(
            num(candles[i].close)>
            num(candles[i].open)
        ){

            buy+=body;

        }else{

            sell+=body;

        }

    }

    let direction="NONE";

    if(buy>sell)
        direction="CALL";

    if(sell>buy)
        direction="PUT";

    return{

        buy,

        sell,

        direction

    };

}

// =========================================
// VOLATILITY FILTER
// =========================================

function volatilityFilter(candles){

    const avg=averageRange(candles,20);

    let status="GOOD";

    if(avg<0.00015)
        status="LOW";

    if(avg>0.004)
        status="HIGH";

    return{

        value:avg,

        status

    };

}

// =========================================
// TIME FILTER
// =========================================

function timeFilter(){

    const now=new Date(
        new Date().toLocaleString(
            "en-US",
            {
                timeZone:"Asia/Kolkata"
            }
        )
    );

    const hour=now.getHours();

    let score=0;

    if(hour>=8 && hour<=12)
        score=100;

    else if(hour>=13 && hour<=17)
        score=90;

    else if(hour>=18 && hour<=21)
        score=75;

    else
        score=50;

    return{

        hour,

        score

    };

}

// =========================================
// FINAL AI SCORE
// =========================================

function calculateAIConfidence(data){

    let score=0;

    // Historical
    score+=Math.min(
        25,
        data.history.confidence/4
    );

    // Structure
    if(data.structure.trend=="UP" &&
       data.history.direction=="CALL")
        score+=10;

    if(data.structure.trend=="DOWN" &&
       data.history.direction=="PUT")
        score+=10;

    // BOS
    if(
        data.bos.bullish &&
        data.history.direction=="CALL"
    )
        score+=10;

    if(
        data.bos.bearish &&
        data.history.direction=="PUT"
    )
        score+=10;

    // CHOCH
    if(
        data.choch.direction==
        data.history.direction
    )
        score+=10;

    // Liquidity Sweep
    if(
        data.sweep.bullish &&
        data.history.direction=="CALL"
    )
        score+=10;

    if(
        data.sweep.bearish &&
        data.history.direction=="PUT"
    )
        score+=10;

    // Support / Resistance
    if(
        data.sr.support &&
        data.history.direction=="CALL"
    )
        score+=8;

    if(
        data.sr.resistance &&
        data.history.direction=="PUT"
    )
        score+=8;

    // Trend Continuation
    if(
        data.trend.signal==
        data.history.direction
    )
        score+=8;

    // Cluster
    if(
        data.cluster.direction==
        data.history.direction
    )
        score+=6;

    // Tick Pressure
    if(
        data.pressure.direction==
        data.history.direction
    )
        score+=5;

    // Time Filter
    score+=Math.round(
        data.time.score/50
    );

    // Volatility
    if(
        data.volatility.status=="GOOD"
    )
        score+=6;

    if(score>100)
        score=100;

    let label="LOW";

    if(score>=95)
        label="ELITE";

    else if(score>=90)
        label="VERY HIGH";

    else if(score>=80)
        label="HIGH";

    else if(score>=70)
        label="MEDIUM";

    return{

        score,

        label

    };

}
// =======================================================
// ELEVATE AI V30
// PART 4
// MAIN ANALYZE FUNCTION
// =======================================================

function analyzeMarket(candles, timeframe, market){

    if(!candles || candles.length < 500){

        return{
            success:false,
            message:"Not enough historical candles."
        };

    }

    timeframe = parseInt(timeframe);

    const tradeTime = getTradeTime(timeframe);

    // -------------------------
    // Historical Pattern
    // -------------------------

    const historyMatches =
        historicalSimilarity(candles,timeframe);

    const history =
        similarityScore(historyMatches);

    if(history.matches < 15){

        return{

            success:false,

            message:"No strong historical pattern found."

        };

    }

    // -------------------------
    // Price Action
    // -------------------------

    const structure =
        detectMarketStructure(candles);

    const bos =
        detectBOS(candles);

    const choch =
        detectCHOCH(candles);

    const sweep =
        detectLiquiditySweep(candles);

    const sr =
        detectSupportResistance(candles);

    const trend =
        detectTrendContinuation(candles);

    const cluster =
        analyzeCluster(candles);

    const pressure =
        tickPressure(candles);

    const volatility =
        volatilityFilter(candles);

    if(volatility.status!="GOOD"){

        return{

            success:false,

            message:"Market volatility unsuitable."

        };

    }

    const time =
        timeFilter();

    // -------------------------
    // AI Confidence
    // -------------------------

    const ai =
        calculateAIConfidence({

            history,

            structure,

            bos,

            choch,

            sweep,

            sr,

            trend,

            cluster,

            pressure,

            volatility,

            time

        });

    if(ai.score < 70){

        return{

            success:false,

            message:"AI confidence too low."

        };

    }

    // -------------------------
    // Final Direction
    // -------------------------

    const signal =
        history.direction;

    const lastClose =
        parseFloat(
            candles[candles.length-1].close
        );

    return{

        success:true,

        pair:market,

        signal,

        confidence:ai.score,

        confidenceLabel:ai.label,

        trend:structure.trend,

        matches:history.matches,

        historicalWinRate:
        history.winRate.toFixed(1),

        entry:tradeTime.entry,

        expiry:tradeTime.expiry,

        entryPrice:lastClose,

        marketStructure:{

            hh:structure.hh,

            hl:structure.hl,

            lh:structure.lh,

            ll:structure.ll

        },

        bos,

        choch,

        liquiditySweep:sweep,

        supportResistance:sr,

        trendContinuation:trend.signal,

        clusterDirection:cluster.direction,

        tickPressure:pressure.direction,

        volatility:volatility.status,

        analysisTime:time.hour

    };

}

module.exports = {

    analyzeMarket

};