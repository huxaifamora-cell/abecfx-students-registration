// The Multi-FX quiz: a bank of multiple-choice questions written from the Multi-FX handbook (DRAFT: edit or add
// questions in BANK below; give every question its own short id and never reuse an id for a different question).
//
// How an attempt works (the website, not the browser, is the judge):
//   1. The student asks for an attempt. We pick PER_ATTEMPT questions at random, shuffle each question's options, and
//      send them WITHOUT the answers, together with a signed "attempt token". The token holds the student, the
//      question ids, how the options were shuffled, an attempt id and an expiry. Nothing is stored yet.
//   2. The student sends back the token and the option they chose for each question. We check the token's signature
//      (so nobody can change the questions or the shuffle), grade the answers here, save the result, and only then
//      show the correct answers with the explanation.
//   3. An attempt id is saved with the result, so the same attempt can be submitted only once.
const crypto = require("crypto");

const PER_ATTEMPT = 20;
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // an attempt must be finished within 2 hours

// s = the handbook section the question comes from (see multifx-content.js), a = index of the correct option.
const BANK = [
  { id: "f01", s: "01", q: "What is forex?", o: ["The global market where one currency is exchanged for another", "A stock exchange in London", "A bank savings product", "A type of cryptocurrency"], a: 0, why: "Forex (foreign exchange) is the global market where currencies are exchanged for one another." },
  { id: "f02", s: "01", q: "Forex is called an over-the-counter (OTC) market because:", o: ["It trades only on weekends", "Trading happens electronically through banks and brokers, not on a central exchange", "Only banks are allowed to trade", "Prices never change"], a: 1, why: "There is no single central exchange: trading is done electronically through banks and brokers." },
  { id: "f03", s: "02", q: "In EUR/USD, which is the base currency?", o: ["USD", "EUR", "Both", "Neither"], a: 1, why: "The first currency of a pair is the base (EUR); the second (USD) is the quote currency." },
  { id: "f04", s: "02", q: "You buy EUR/USD at 1.1000 and sell at 1.1050. How many pips did price move in your favour?", o: ["5 pips", "10 pips", "50 pips", "500 pips"], a: 2, why: "1.1050 minus 1.1000 is 0.0050, which is 50 pips." },
  { id: "f05", s: "03", q: "What is the spread?", o: ["The profit of a trade", "The difference between the bid and ask price", "The size of a lot", "The deposit needed for leverage"], a: 1, why: "The spread is the gap between the bid and ask price and is part of the cost of trading." },
  { id: "f06", s: "03", q: "Leverage lets a trader control a larger position with a smaller deposit. What else does it do?", o: ["It removes risk", "It guarantees profit", "It increases risk as well as potential profit", "It lowers the spread"], a: 2, why: "Leverage magnifies both gains and losses, so it increases risk." },
  { id: "f07", s: "04", q: "An uptrend is made of:", o: ["Lower highs and lower lows", "Higher highs and higher lows", "Equal highs and equal lows", "Only bullish candles"], a: 1, why: "An uptrend forms higher highs and higher lows; a downtrend forms lower highs and lower lows." },
  { id: "f08", s: "04", q: "A ranging market is one that:", o: ["Moves sideways", "Only moves up", "Only moves down", "Is closed"], a: 0, why: "A ranging market moves sideways without making clear higher or lower swings." },
  { id: "f09", s: "05", q: "A common risk-to-reward objective is to risk 1 unit to target at least:", o: ["0.5 units", "1 unit", "2 units", "10 units"], a: 2, why: "Many traders aim for at least a 1:2 risk-to-reward ratio." },
  { id: "f10", s: "05", q: "What does a stop-loss order do?", o: ["Locks in a profit", "Limits your loss if price moves against the trade", "Opens a second trade", "Lowers the spread"], a: 1, why: "A stop loss limits the loss if price moves against your trade." },
  { id: "f11", s: "05", q: "Which of these is a common risk-management mistake?", o: ["Deciding the stop loss before entering", "Risking a small percentage per trade", "Moving your stop loss further away after the trade goes against you", "Keeping a trading journal"], a: 2, why: "Moving stop losses, overleveraging, revenge trading and risking too much on one trade are common mistakes." },
  { id: "f12", s: "06", q: "According to the guide, fear in trading typically causes traders to:", o: ["Hold positions too long", "Exit too early", "Ignore their stop loss", "Trade larger lots"], a: 1, why: "Fear causes traders to exit too early, while greed encourages holding positions too long." },
  { id: "f13", s: "06", q: "A trading journal should record:", o: ["Only winning trades", "Why the trade was entered, the result and the lessons learned", "Only the account balance", "Other traders' opinions"], a: 1, why: "Record every trade: the reason for entry, the result and what you learned." },
  { id: "f14", s: "07", q: "Liquidity means:", o: ["The rate at which prices change", "The ease of buying or selling without significantly affecting price", "The price at which the market buys", "A standard trading volume"], a: 1, why: "Liquidity is how easily you can buy or sell without moving the price much. Volatility is the rate of price change." },

  { id: "c01", s: "08", q: "Which four prices does a candlestick show?", o: ["Open, high, low, close", "Bid, ask, spread, lot", "Support, resistance, trend, range", "Buy, sell, stop, target"], a: 0, why: "A candlestick shows the Open, High, Low and Close (OHLC) of a period." },
  { id: "c02", s: "08", q: "The body of a candlestick represents:", o: ["The highest price reached", "The distance between the open and the close", "The lowest price reached", "The trading volume"], a: 1, why: "The body is the distance between the opening and closing prices; the wicks show the extremes." },
  { id: "c03", s: "08", q: "A bullish candlestick forms when:", o: ["The close is higher than the open", "The close is lower than the open", "The open equals the high", "It is displayed in red"], a: 0, why: "A bullish candle closes above its open, showing that buyers were stronger in that period." },
  { id: "c04", s: "08", q: "A candle with a very small body and open and close almost equal is called a:", o: ["Marubozu", "Hammer", "Doji", "Shooting star"], a: 2, why: "A doji shows indecision: neither buyers nor sellers gained control." },
  { id: "c05", s: "08", q: "Long wicks on a candle often indicate:", o: ["Rejection of a price level", "Strong trend continuation with no resistance", "That the market is closed", "A guaranteed reversal"], a: 0, why: "Long wicks often show that price was pushed away from a level, which is called rejection." },
  { id: "c06", s: "08", q: "A hammer is a bullish reversal candle that usually appears:", o: ["After an uptrend", "After a downtrend", "Only on the daily chart", "Only in a range"], a: 1, why: "A hammer (small body at the top, long lower wick) appears after a downtrend and suggests rejection of lower prices." },
  { id: "c07", s: "08", q: "A candle that looks exactly like a hammer but appears after an uptrend is a:", o: ["Hanging man", "Shooting star", "Inverted hammer", "Spinning top"], a: 0, why: "The hanging man looks like the hammer but appears after an uptrend and warns of a possible bearish reversal." },
  { id: "c08", s: "08", q: "A shooting star has a small body near the bottom and:", o: ["A long lower wick", "No wicks at all", "A long upper wick", "Two equal wicks"], a: 2, why: "A shooting star has a long upper wick: buyers pushed price up but sellers forced it back down." },
  { id: "c09", s: "08", q: "A Marubozu candle has:", o: ["Little or no wicks and signals strong momentum", "Very long wicks on both sides", "No body", "Equal open and close"], a: 0, why: "A marubozu has little or no wicks: strong buying or selling throughout the period." },
  { id: "c10", s: "08", q: "How should a single candlestick signal be used?", o: ["As a standalone trading signal", "Together with market structure, support and resistance, trend and risk management", "Only when it is green", "It should be ignored completely"], a: 1, why: "No candlestick should be used alone. The best opportunities appear when candle signals line up with other analysis." },

  { id: "v01", s: "09", q: "Volatility Indices are generated by:", o: ["Economic news", "A cryptographically secure Random Number Generator", "Central bank decisions", "Real company profits"], a: 1, why: "They are synthetic: a secure RNG creates price movement at a set level of volatility." },
  { id: "v02", s: "09", q: "Volatility Indices are available to trade:", o: ["Monday to Friday only", "Only during the London session", "24 hours a day, 7 days a week", "Only on public holidays"], a: 2, why: "Because they do not depend on real-world markets, they trade 24/7." },
  { id: "v03", s: "09", q: "The number in a name such as Volatility 75 represents:", o: ["The price of the index", "Its constant volatility level", "The number of trades per day", "The minimum lot size"], a: 1, why: "The number is the index's constant simulated volatility level (75%)." },
  { id: "v04", s: "09", q: "What is special about the 1-second (1s) versions of Volatility Indices?", o: ["They only move once per second and are slower", "They update more frequently and produce faster price movement", "They have no volatility", "They are only for beginners"], a: 1, why: "The 1s versions follow the same volatility level but update more often, which suits short-term traders." },

  { id: "s01", s: "10", q: "Which sequence describes a bullish market structure?", o: ["LL, LH, LL, LH", "HH, HL, HH, HL", "HH, LL, HH, LL", "HL, LL, HL, LL"], a: 1, why: "An uptrend forms HH → HL → HH → HL." },
  { id: "s02", s: "10", q: "In SMC, liquidity refers to:", o: ["The amount of money in your account", "Areas where a large number of orders are likely to sit, such as previous highs and lows", "The speed of the internet connection", "The number of candles on a chart"], a: 1, why: "Liquidity sits at previous highs and lows, equal highs and lows, obvious support and resistance and stop-loss clusters." },
  { id: "s03", s: "10", q: "A liquidity sweep happens when price:", o: ["Never reaches an obvious high or low", "Moves through an obvious high or low, triggers the orders there, then reverses", "Moves sideways for a week", "Gaps up at the open"], a: 1, why: "Price takes out the orders around an obvious level and then reverses." },
  { id: "s04", s: "10", q: "A bullish order block is commonly identified at:", o: ["The final bearish candle before a strong bullish move", "The first bullish candle after a doji", "The highest candle on the chart", "Any green candle"], a: 0, why: "A bullish order block is commonly the last bearish candle before a strong move up." },
  { id: "s05", s: "10", q: "A breaker block develops when:", o: ["An order block holds for a long time", "A previously respected order block fails and price breaks through it", "Price never touches a zone", "Two dojis appear together"], a: 1, why: "When an order block fails, the zone can change its role (support becomes resistance, or the reverse)." },
  { id: "s06", s: "10", q: "A fair value gap (FVG) is commonly identified with:", o: ["One candle", "A three-candle formation where the wicks of the first and third candles do not overlap", "A 200-period average", "A news release"], a: 1, why: "An FVG is a price imbalance left when the second candle moves aggressively and candles one and three do not overlap." },
  { id: "s07", s: "10", q: "In an uptrend, a break of structure (BOS) is price breaking:", o: ["Below the previous higher low only", "Above a previous higher high", "Sideways", "Below the previous lower low"], a: 1, why: "A BOS is a break of a swing level in the direction of the prevailing structure; in an uptrend, above a previous higher high." },
  { id: "s08", s: "10", q: "A change of character (ChoCH) is:", o: ["A change of broker", "An early sign that price behaviour may be changing, such as breaking an important higher low in an uptrend", "The same as a stop loss", "Any candle that closes red"], a: 1, why: "ChoCH is about a change in how price behaves, so look for more confirmation before assuming a full reversal." },
  { id: "s09", s: "10", q: "In a bullish context, SMC traders look for buying opportunities in:", o: ["Premium areas", "Discount areas", "Anywhere", "Only at equilibrium"], a: 1, why: "In a bullish context traders look to buy in the discount (lower) part of a range, and to sell in premium areas in a bearish context." },
  { id: "s10", s: "10", q: "What is accumulation?", o: ["A period in which buying is believed to take place in a range before a potential move higher", "A period in which sellers take over after a rally", "Adding to a losing trade", "Saving profits in a bank"], a: 0, why: "Accumulation is buying activity inside a defined range before a potential expansion higher; distribution is the selling equivalent." },
  { id: "s11", s: "10", q: "In the eight-step SMC analysis, the first step is to:", o: ["Enter the trade", "Identify the higher-timeframe structure", "Place the take profit", "Draw a Fibonacci tool"], a: 1, why: "You start with the bigger picture: is the market bullish, bearish or ranging?" },
  { id: "s12", s: "10", q: "Why should you not enter just because price touched a zone?", o: ["Zones never work", "You should look for confirmation, because a touch alone is not a signal", "Price never returns to zones", "It is against the broker's rules"], a: 1, why: "Look for confirmation. An order block or FVG is not automatically an entry signal." },
  { id: "s13", s: "10", q: "The guide says the 1-2% risk-per-trade guideline is:", o: ["A universal law", "A risk-management convention, not a universal rule; choose a level that suits you", "Illegal in some countries", "Only for Forex"], a: 1, why: "Risk levels should suit your capital, strategy and circumstances." },

  { id: "p01", s: "11", q: "What is a \"sweep\" in the practical examples?", o: ["Price briefly moves beyond an obvious previous high or low, then reverses", "A sudden news event", "Closing all trades at once", "A very small candle"], a: 0, why: "A sweep takes the orders around an obvious level and then price reverses." },
  { id: "p02", s: "11", q: "In Example 2, why is it a buy setup?", o: ["Price broke above resistance on high volume", "Price swept the previous low into a demand zone, giving a bullish setup for a move higher", "A doji appeared at the top of the range", "The spread was small"], a: 1, why: "The sequence was: structure forms, liquidity is created, price sweeps the low, price enters the demand zone, buy setup." },
  { id: "p03", s: "11", q: "How does the guide describe inducement liquidity for a beginner?", o: ["An area that may attract traders before price makes the larger move", "A broker fee", "A guaranteed reversal point", "Any small swing, always"], a: 0, why: "The guide also warns: do not treat every small swing as inducement; it must make sense within the broader structure." },
];

const BANK_BY_ID = new Map(BANK.map((q) => [q.id, q]));

// ---- self-check at load: a bad question here would silently mark students wrong ----
(function check() {
  const seen = new Set();
  for (const q of BANK) {
    if (!/^[a-z]\d{2}$/.test(q.id) || seen.has(q.id)) throw new Error("multifx-quiz: bad or duplicate id " + q.id);
    seen.add(q.id);
    if (!Array.isArray(q.o) || q.o.length !== 4 || new Set(q.o).size !== 4) throw new Error("multifx-quiz: " + q.id + " needs 4 different options");
    if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) throw new Error("multifx-quiz: " + q.id + " has no correct option");
  }
  if (BANK.length < PER_ATTEMPT) throw new Error("multifx-quiz: the bank has fewer questions than one attempt needs");
})();

function mac(payload, secret) {
  return crypto.createHmac("sha256", secret).update("multifxquiz." + payload).digest("base64url");
}

function shuffled(n, random) {
  const a = Array.from({ length: n }, (_v, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = random(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Start an attempt for `reg`. Returns { token, attemptId, total, questions: [{ id, section, q, options }] } (no answers).
function startAttempt(reg, secret, o = {}) {
  const random = o.random || ((n) => crypto.randomInt(n));
  const now = o.now == null ? Date.now() : o.now;
  const count = Math.min(o.count || PER_ATTEMPT, BANK.length);
  const picked = shuffled(BANK.length, random).slice(0, count).map((i) => BANK[i]);
  const attemptId = crypto.randomBytes(8).toString("hex");
  const plan = picked.map((q) => [q.id, shuffled(4, random)]); // plan[i][1][j] = original index of the option shown in slot j
  const payload = Buffer.from(JSON.stringify({ r: reg, n: attemptId, e: now + TOKEN_TTL_MS, p: plan })).toString("base64url");
  return {
    token: payload + "." + mac(payload, secret),
    attemptId,
    total: picked.length,
    questions: picked.map((q, i) => ({ id: q.id, section: q.s, q: q.q, options: plan[i][1].map((orig) => q.o[orig]) })),
  };
}

// Returns the signed attempt { reg, attemptId, plan } or null when the token is not ours, was changed, or has expired.
function readToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4000 || !secret) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const a = Buffer.from(mac(payload, secret));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!(d.e > now) || !/^ABECFX\/\d{2}\/\d{4}$/.test(d.r) || !/^[0-9a-f]{16}$/.test(d.n) || !Array.isArray(d.p)) return null;
    return { reg: d.r, attemptId: d.n, plan: d.p };
  } catch (e) {
    return null;
  }
}

// answers[i] is the slot (0-3) the student chose for question i, or null for no answer.
// Returns { score, total, breakdown: { section: [right, asked] }, review: [...] } or null when the answers do not fit the attempt.
function grade(attempt, answers) {
  if (!attempt || !Array.isArray(answers) || answers.length !== attempt.plan.length) return null;
  let score = 0;
  const breakdown = {};
  const review = [];
  for (let i = 0; i < attempt.plan.length; i++) {
    const [id, perm] = attempt.plan[i];
    const q = BANK_BY_ID.get(id);
    if (!q || !Array.isArray(perm) || perm.length !== 4) return null;
    const a = answers[i];
    const chosen = Number.isInteger(a) && a >= 0 && a <= 3 ? a : null;
    const correctSlot = perm.indexOf(q.a);
    const right = chosen === correctSlot;
    if (right) score++;
    if (!breakdown[q.s]) breakdown[q.s] = [0, 0];
    breakdown[q.s][1]++;
    if (right) breakdown[q.s][0]++;
    review.push({ id, section: q.s, q: q.q, options: perm.map((orig) => q.o[orig]), chosen, correct: correctSlot, right, why: q.why });
  }
  return { score, total: attempt.plan.length, breakdown, review };
}

module.exports = { BANK, PER_ATTEMPT, TOKEN_TTL_MS, startAttempt, readToken, grade };
