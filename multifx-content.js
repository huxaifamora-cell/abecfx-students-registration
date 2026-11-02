// The Multi-FX course content: the handbook sections and the workbook for each section.
//
// Handbook: the text is taken from the owner's PDF "Multi FX Trading Strategy Guide" (private/multifx-handbook.pdf).
// The charts, candlestick drawings and the annotated example screenshots stay in the PDF; every section says which
// PDF pages to open for them. `pdf: [from, to]` are PDF page numbers (the number your PDF reader shows), which is
// the printed page number + 2 because the cover and contents pages are not numbered.
//
// Workbook: a DRAFT written from the handbook text (key terms, a self-check with answers, practical tasks). Edit it here;
// progress adjusts itself to the number of sections. The video and the extra link of each workbook are NOT here:
// the editor sets them on the dashboard's Multi-FX tab.
//
// Block types (same as the main handbook): p, h, ul, ol, table (head + rows), cards, note, quote.

const SECTIONS = [
  {
    id: "00", title: "Introduction", pdf: [5, 6],
    tagline: "A strong foundation is one of the most valuable investments you can make in your trading journey.",
    blocks: [
      { t: "p", x: "Welcome to the Multi FX Volatility Index Trading Strategy Guide. Its purpose is to equip traders with the knowledge, skills and structured approach needed to understand and confidently apply a Volatility Index trading strategy." },
      { t: "p", x: "Rather than focusing only on entry and exit signals, this guide stresses the principles behind every trading decision. A well-defined strategy, sound market knowledge, disciplined execution and effective risk management together build consistency and better decision-making." },
      { t: "p", x: "The guide is centred on trading Volatility Indices with the Smart Money Concept, but success begins with the fundamentals of financial market analysis. The concepts that govern price movement, market structure, risk management and trading psychology are universal. They are the foundation of every successful trader, whatever market they trade." },
      { t: "h", x: "How the guide is laid out" },
      { t: "ol", items: [
        "The fundamentals: forex, currency pairs, trading terms, reading charts, risk management and trading psychology.",
        "A quick glossary of the words you will meet again and again.",
        "Understanding candlestick charts.",
        "Understanding Volatility Indices, the market this strategy is traded on.",
        "The Smart Money Concept (SMC): structure, liquidity, order blocks, fair value gaps and more.",
        "Practical setups, shown on real charts.",
      ] },
      { t: "p", x: "The objective is not simply to teach you a strategy, but to help you develop the analytical mindset, discipline and consistency needed to become a confident trader over the long term." },
      { t: "note", x: "Take your time with each section before moving on. Study it, then do its workbook." },
    ],
  },
  {
    id: "01", title: "Introduction to Forex", pdf: [7, 7],
    tagline: "The global market where one currency is exchanged for another.",
    blocks: [
      { t: "h", x: "What is Forex?" },
      { t: "p", x: "Forex (foreign exchange or FX) is the global market where one currency is exchanged for another. It supports international trade, tourism, investment and cross-border payments. Unlike stock markets, Forex is an over-the-counter (OTC) market: trading happens electronically through banks and brokers rather than on a central exchange." },
      { t: "h", x: "Example" },
      { t: "p", x: "A traveller from Nigeria visiting the United Kingdom exchanges Nigerian Naira for British Pounds. Businesses importing goods also exchange currencies. Traders speculate on these exchange-rate movements to seek profits." },
      { t: "h", x: "Key facts" },
      { t: "p", x: "The Forex market operates 24 hours a day from Monday to Friday through the Sydney, Tokyo, London and New York trading sessions. It is the world's largest financial market by daily trading volume." },
      { t: "h", x: "Key takeaways" },
      { t: "ul", items: ["Understand the concepts before trading real money.", "Practise on a demo account.", "Follow a trading plan.", "Protect capital through risk management."] },
    ],
  },
  {
    id: "02", title: "Currency Pairs", pdf: [8, 8],
    tagline: "Currencies are always quoted in pairs.",
    blocks: [
      { t: "h", x: "Base and quote currency" },
      { t: "p", x: "In EUR/USD, EUR is the base currency and USD is the quote currency. If EUR/USD is 1.1500, one euro is worth 1.15 US dollars." },
      { t: "h", x: "Major pairs" },
      { t: "p", x: "Major pairs include EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD and NZD/USD. They generally have the highest liquidity and the lowest spreads." },
      { t: "h", x: "Example" },
      { t: "p", x: "If you buy EUR/USD at 1.1000 and sell at 1.1050, the price moved 50 pips in your favour." },
      { t: "ul", items: ["Understand the concepts before trading real money.", "Practise on a demo account.", "Follow a trading plan.", "Protect capital through risk management."] },
    ],
  },
  {
    id: "03", title: "Essential Trading Terms", pdf: [9, 9],
    tagline: "Four words every trader must understand: pip, spread, leverage and margin.",
    blocks: [
      { t: "cards", items: [
        { h: "Pip", x: "A pip is usually the fourth decimal place in most currency pairs and represents a small price movement." },
        { h: "Spread", x: "The difference between the bid and ask price. It is part of the cost of trading." },
        { h: "Leverage", x: "Lets traders control larger positions with a smaller deposit. It can increase profits, but it also increases risk." },
        { h: "Margin", x: "The amount of money required to open and maintain a leveraged position." },
      ] },
      { t: "note", x: "Leverage magnifies losses as much as it magnifies profits. Know your margin before you open a trade." },
    ],
  },
  {
    id: "04", title: "Reading Charts", pdf: [10, 10],
    tagline: "Open, high, low, close, and the direction price is travelling.",
    blocks: [
      { t: "h", x: "Candlesticks" },
      { t: "p", x: "Candlestick charts display the open, high, low and close prices for a chosen time period." },
      { t: "h", x: "Trend" },
      { t: "p", x: "An uptrend forms higher highs and higher lows. A downtrend forms lower highs and lower lows. A ranging market moves sideways." },
      { t: "h", x: "Example" },
      { t: "p", x: "Many traders wait for price to respect a support level before considering a buy opportunity." },
    ],
  },
  {
    id: "05", title: "Risk Management", pdf: [11, 11],
    tagline: "Professional traders protect capital first.",
    blocks: [
      { t: "cards", items: [
        { h: "Position sizing", x: "Professional traders typically risk only a small percentage of their account on each trade." },
        { h: "Risk-to-reward", x: "A common objective is risking 1 unit to target at least 2 units of potential reward." },
        { h: "Stop loss", x: "A stop-loss order limits your loss if price moves against your trade." },
        { h: "Common mistakes", x: "Overleveraging, moving stop losses, revenge trading and risking too much on one trade." },
      ] },
      { t: "note", x: "Decide your risk before you enter, never after." },
    ],
  },
  {
    id: "06", title: "Trading Psychology", pdf: [12, 12],
    tagline: "Discipline beats emotion.",
    blocks: [
      { t: "cards", items: [
        { h: "Discipline", x: "Successful trading depends on consistently following a trading plan rather than emotions." },
        { h: "Fear and greed", x: "Fear causes traders to exit too early, while greed encourages holding positions too long." },
        { h: "Trading journal", x: "Record every trade: why it was entered, the result and the lessons learned." },
      ] },
    ],
  },
  {
    id: "07", title: "Quick Glossary", pdf: [13, 13],
    tagline: "Five words to know before you go on.",
    blocks: [
      { t: "table", head: ["Term", "Meaning"], rows: [
        ["Bid", "Price at which the market buys."],
        ["Ask", "Price at which the market sells."],
        ["Lot", "Standard trading volume."],
        ["Liquidity", "Ease of buying or selling without significantly affecting price."],
        ["Volatility", "Rate at which prices change."],
      ] },
    ],
  },
  {
    id: "08", title: "Understanding Candlestick Charts", pdf: [14, 24],
    tagline: "Every candlestick tells the story of the battle between buyers and sellers.",
    blocks: [
      { t: "p", x: "Candlestick charts are one of the most widely used tools in financial markets because they give a clear picture of price movement over a specific period. Whether you trade Volatility Indices, Forex, stocks or crypto, reading candlesticks is a skill every trader must develop." },
      { t: "h", x: "What is a candlestick?" },
      { t: "p", x: "A candlestick is a graphical representation of price movement over a specific period of time. It shows four prices:" },
      { t: "ul", items: ["Open: the price at which the period began.", "High: the highest price reached during the period.", "Low: the lowest price reached during the period.", "Close: the price at which the period ended."] },
      { t: "h", x: "Anatomy of a candlestick" },
      { t: "cards", items: [
        { h: "The body", x: "The distance between the open and the close. A long body means strong buying or selling pressure; a short body means limited movement and indecision." },
        { h: "The wicks (shadows)", x: "The thin lines above and below the body. The upper wick shows the highest price reached before the market moved lower; the lower wick shows the lowest price reached before the market moved higher. Long wicks often show rejection of a price level." },
      ] },
      { t: "h", x: "Bullish and bearish candlesticks" },
      { t: "cards", items: [
        { h: "Bullish", x: "The close is higher than the open. Buyers were stronger than sellers in that period. Commonly shown in green, blue or white." },
        { h: "Bearish", x: "The close is lower than the open. Sellers controlled the market in that period. Commonly shown in red or black." },
      ] },
      { t: "h", x: "What candlesticks tell you" },
      { t: "ul", items: [
        "A large bullish candle shows strong buying momentum.",
        "A large bearish candle shows strong selling momentum.",
        "A candle with long upper and lower wicks suggests uncertainty or indecision.",
        "A small candle often means neither buyers nor sellers have taken control.",
      ] },
      { t: "p", x: "A single candlestick should never be used on its own to make a trading decision. Read it in the context of the overall trend, nearby support and resistance, and the broader market structure." },
      { t: "h", x: "Candlestick timeframes" },
      { t: "p", x: "Each candlestick covers a specific period, called a timeframe. A candle on the 1-minute chart can look completely different from the matching candle on the 1-hour or daily chart, because each timeframe summarises a different duration of price movement." },
      { t: "h", x: "Types of candlesticks" },
      { t: "p", x: "Rather than memorising patterns, focus on understanding the story each candlestick tells. No single candle guarantees the market's next move." },
      { t: "table", head: ["Candle", "What it looks like", "What it suggests"], rows: [
        ["Bullish", "Close above the open", "Buying pressure; often in an uptrend or at the start of a reversal"],
        ["Bearish", "Close below the open", "Selling pressure; often in a downtrend or at the start of a bearish reversal"],
        ["Long bullish", "Large body, little or no wicks", "Strong buying momentum; buyers in control"],
        ["Long bearish", "Large body, small wicks", "Strong selling momentum; sellers in control"],
        ["Doji", "Open and close equal or nearly equal; very small body", "Indecision; may come before a reversal or a continuation"],
        ["Hammer", "Small body near the top, long lower wick, little or no upper wick, after a downtrend", "Rejection of lower prices; potential bullish reversal"],
        ["Inverted hammer", "Small body, long upper wick, small or no lower wick, after a downtrend", "Buyers becoming active; possible bullish reversal if confirmed"],
        ["Hanging man", "Looks exactly like the hammer but appears after an uptrend", "Buyers may be losing strength; possible bearish reversal"],
        ["Shooting star", "Small body near the bottom, long upper wick, little or no lower wick, after an uptrend", "Rejection of higher prices; potential bearish reversal"],
        ["Spinning top", "Small body with long upper and lower wicks", "Indecision and weak momentum; wait for confirmation"],
        ["Marubozu", "Little or no wicks (bullish or bearish)", "Strong momentum and high conviction; often trend continuation"],
      ] },
      { t: "note", x: "No candlestick should be used as a standalone trading signal. Analyse it together with market structure, support and resistance, trend direction, volume (where available) and risk management. The highest-probability opportunities occur when candlestick signals line up with these other forms of analysis." },
      { t: "h", x: "Key takeaways" },
      { t: "ul", items: [
        "A candlestick shows the Open, High, Low and Close (OHLC) of a trading period.",
        "The body is the difference between the open and the close; the wicks show the highest and lowest prices reached.",
        "Bullish candles show buying pressure; bearish candles show selling pressure.",
        "Long-bodied candles show strong momentum; long wicks often show price rejection.",
        "Indecision candles should always be confirmed before you take a trade.",
        "Always combine candlestick analysis with market structure and sound risk management.",
      ] },
    ],
  },
  {
    id: "09", title: "Understanding Volatility Indices", pdf: [25, 27],
    tagline: "Synthetic markets that are open 24 hours a day, 7 days a week.",
    blocks: [
      { t: "p", x: "Before learning the strategy, understand the market you will trade. Volatility Indices are synthetic financial instruments designed to simulate different levels of market volatility." },
      { t: "p", x: "Unlike Forex, stocks or commodities, they are not influenced by economic news, interest-rate decisions, geopolitical events or market sentiment. They are generated by a cryptographically secure Random Number Generator (RNG), so price movements reflect a chosen level of volatility while staying available 24/7. That continuous access lets traders apply technical analysis without interruptions from market closures." },
      { t: "h", x: "Common Volatility Indices" },
      { t: "ul", items: ["Volatility 10 Index", "Volatility 25 Index", "Volatility 50 Index", "Volatility 75 Index", "Volatility 100 Index"] },
      { t: "p", x: "Each is also available in a 1-second version (for example Volatility 10 (1s) Index), which updates more frequently and produces faster price movements." },
      { t: "h", x: "Understanding the numbers" },
      { t: "p", x: "The number in the name is the index's constant volatility level." },
      { t: "table", head: ["Index", "Simulated volatility", "Character"], rows: [
        ["Volatility 10", "About 10%", "Generally smaller price fluctuations"],
        ["Volatility 25", "25%", "Moderate price movement"],
        ["Volatility 50", "50%", "A balance between stability and volatility"],
        ["Volatility 75", "75%", "Larger and faster price swings"],
        ["Volatility 100", "100%", "One of the most volatile synthetic indices; generally for experienced traders with strong risk management"],
      ] },
      { t: "p", x: "The 1-second variants follow the same volatility characteristics but update more often, which makes them attractive to short-term traders and scalpers." },
      { t: "h", x: "Choosing the right Volatility Index" },
      { t: "p", x: "There is no single best index. The right choice depends on your trading objectives, preferred timeframe and ability to manage risk. Traders who prefer slower, more controlled price action may like lower-volatility indices; those seeking larger moves often choose higher-volatility ones. Whichever you pick, technical analysis, disciplined execution and risk management stay the foundation of consistent trading." },
    ],
  },
  {
    id: "10", title: "Smart Money Concept (SMC)", pdf: [28, 42],
    tagline: "A way of organising price information: structure, liquidity and the reaction around key zones.",
    blocks: [
      { t: "h", x: "Introduction" },
      { t: "p", x: "Smart Money Concepts (SMC) is a price-action framework used to study market structure, liquidity, price imbalances and the areas where significant buying or selling may have influenced price." },
      { t: "p", x: "The central idea is simple: instead of relying mainly on traditional indicators, SMC traders study how price moves from one area of liquidity to another, how market structure changes, and how price reacts around important zones." },
      { t: "p", x: "SMC is commonly associated with the teachings of Michael J. Huddleston, known as The Inner Circle Trader (ICT), whose work popularised liquidity, market structure, order blocks and fair value gaps. Modern SMC is used broadly, and terminology and interpretation can differ from one educator to another." },
      { t: "h", x: "The SMC framework" },
      { t: "ol", items: ["Market structure", "Liquidity", "Order blocks", "Breaker blocks", "Fair value gaps", "Break of structure (BOS)", "Change of character (ChoCH)", "Premium and discount", "Accumulation and distribution", "Liquidity grabs", "Risk management"] },
      { t: "p", x: "These concepts are not meant to be viewed on their own. The real value of SMC comes from combining them into a logical picture of what price is doing." },

      { t: "h", x: "1. Market structure" },
      { t: "p", x: "Market structure is the foundation of SMC. Price forms a sequence of Higher Highs (HH), Higher Lows (HL), Lower Highs (LH) and Lower Lows (LL)." },
      { t: "cards", items: [
        { h: "Uptrend", x: "HH → HL → HH → HL" },
        { h: "Downtrend", x: "LL → LH → LL → LH" },
      ] },
      { t: "p", x: "By identifying these swings you can read the current directional structure. The aim is not to predict whether price will rise or fall, but to observe whether the existing structure is being respected or broken." },

      { t: "h", x: "2. Liquidity" },
      { t: "p", x: "Liquidity refers to areas where a large number of orders are likely to sit. Common examples:" },
      { t: "ul", items: ["Previous highs", "Previous lows", "Equal highs", "Equal lows", "Obvious support and resistance areas", "Stop-loss clusters"] },
      { t: "p", x: "Price may move toward these areas before its next significant move. A liquidity grab (or sweep) happens when price moves through an obvious high or low, triggers the orders around it, and then reverses. Do not assume every breakout is a genuine continuation: the reaction after the breakout matters." },

      { t: "h", x: "3. Order blocks" },
      { t: "p", x: "An order block is an area on the chart linked to a significant price move." },
      { t: "cards", items: [
        { h: "Bullish order block", x: "Commonly the final bearish candle before a strong bullish move." },
        { h: "Bearish order block", x: "Commonly the final bullish candle before a strong bearish move." },
      ] },
      { t: "p", x: "Traders watch these areas because price may return to them later and react. An order block is not a guaranteed reversal zone: it is stronger when it lines up with market structure, liquidity and other confirmation." },

      { t: "h", x: "4. Breaker blocks" },
      { t: "p", x: "A breaker block develops when a previously respected order block fails and price breaks through its structure. These zones appear after a market-structure breakout, when critical liquidity levels could not be held. Price first makes a false move in one direction to collect liquidity, then abruptly reverses and breaks a key level." },
      { t: "p", x: "For example, a bullish order block may first act as support. If price later breaks decisively below it, the same zone can become resistance when price returns. A breaker block helps you see how a former support or resistance area has changed its role." },

      { t: "h", x: "5. Fair value gaps (FVG)" },
      { t: "p", x: "A fair value gap is a price imbalance, commonly found with a three-candle formation: the second candle has a very large body, and the wicks of the first and third candles do not overlap. FVGs appear when price moves quickly without enough trading volume, and price tends to revisit the area to rebalance supply and demand." },
      { t: "p", x: "In a bullish move, the gap between the high of the first candle and the low of the third candle forms a bullish FVG. An FVG is not automatically an entry signal: its location relative to structure, liquidity and the wider context matters." },

      { t: "h", x: "6. Break of structure (BOS)" },
      { t: "p", x: "A BOS happens when price breaks an important swing level in the direction of the prevailing structure: in an uptrend, a break above a previous Higher High; in a downtrend, a break below a previous Lower Low. It is commonly used as evidence that the structure may be continuing. The key is telling a meaningful structural break from a brief spike." },

      { t: "h", x: "7. Change of character (ChoCH)" },
      { t: "p", x: "A ChoCH is an early sign that price behaviour may be changing. Say the market has been making HH → HL → HH → HL. If price then breaks an important Higher Low, bullish structure may be weakening, and a transition could develop:" },
      { t: "quote", x: "HH → HL → HH → break of HL → LH → LL" },
      { t: "p", x: "ChoCH is about a change in how price behaves, not simply continuation. Still look for more confirmation, because one structural break does not guarantee a full reversal." },

      { t: "h", x: "8. Premium and discount" },
      { t: "p", x: "SMC traders divide a significant price range in two: the upper portion is premium and the lower portion is discount. The midpoint is called equilibrium. In a bullish context, traders look for buying opportunities in discount areas; in a bearish context, for selling opportunities in premium areas. This gives context for where a setup occurs, instead of treating every order block or liquidity level equally." },

      { t: "h", x: "9. Accumulation and distribution" },
      { t: "p", x: "SMC also considers how price behaves inside ranges. Accumulation is a period in which buying is believed to take place within a defined range before a potential move higher. Distribution is a period in which selling is believed to take place before a potential move lower. These ideas are closely related to the Wyckoff framework and are often combined with liquidity sweeps, market structure and breakouts." },

      { t: "h", x: "10. Liquidity grabs" },
      { t: "p", x: "Liquidity grabs are deliberate moves by large participants to force retail traders to close their positions early. The sharp moves happen near key levels where stop-loss orders gather, and those orders become the liquidity that large participants use to open positions at favourable prices." },
      { t: "p", x: "After the protective orders are triggered, price makes a sharp reversal. Studying false breakouts helps you see the intentions of key participants, find better entry points, avoid false breakouts and reduce the risk of loss." },

      { t: "h", x: "How the concepts work together" },
      { t: "ol", items: [
        "Identify the higher-timeframe structure. Is the market bullish, bearish or ranging?",
        "Identify important liquidity. Where are the obvious highs, lows, equal highs or equal lows?",
        "Wait for price to interact with liquidity. Does price sweep or break an important level?",
        "Study the structure reaction. Does price produce a BOS or a ChoCH?",
        "Identify relevant zones. Look for an order block, breaker block or FVG.",
        "Consider premium or discount. Is the setup in a logical area of the range?",
        "Look for confirmation. Do not enter simply because price touched a zone.",
        "Define the risk before entering. Know where the setup becomes invalid and where the target lies.",
      ] },

      { t: "h", x: "11. SMC and risk management" },
      { t: "p", x: "SMC does not remove trading risk. You can read an order block, FVG, liquidity sweep or structural break correctly and the trade can still fail, so risk management stays essential. A practical framework defines:" },
      { t: "ul", items: ["Maximum risk per trade", "Stop-loss location", "Position size", "Trade invalidation level", "Target area", "Maximum number of trades", "Conditions under which no trade should be taken"] },
      { t: "p", x: "The 1-2% risk-per-trade guideline often used in educational SMC material is a risk-management convention, not a universal rule. Choose risk levels that suit your capital, your strategy and your circumstances." },

      { t: "h", x: "The SMC mindset" },
      { t: "p", x: "SMC is not just a collection of terms such as BOS, ChoCH, FVG and order block. It is a way of organising price information. A trader asks:" },
      { t: "ul", items: ["Where is price?", "What is the current structure?", "Where is liquidity?", "What happened when liquidity was reached?", "Did the structure change?", "Where are the relevant price zones?", "Where is the trade invalidated?", "What is the risk-to-reward profile?"] },
      { t: "p", x: "Once these questions become part of your analysis, the chart becomes less about randomly searching for entries and more about understanding the sequence of price movement." },
    ],
  },
  {
    id: "11", title: "Practical Setups", pdf: [43, 47],
    tagline: "The ideas of the guide, shown on real charts. Open the PDF to see the annotated screenshots.",
    blocks: [
      { t: "note", x: "The chart screenshots for these examples are in the PDF handbook (pages 44 to 47). Open them next to the explanations below." },
      { t: "h", x: "Example 1 (before and after)" },
      { t: "p", x: "The first example shows the same chart before and after the move, so you can compare the setup with what price did next." },
      { t: "h", x: "Example 2" },
      { t: "quote", x: "Structure forms → liquidity is created → price sweeps the low → price enters the demand zone → buy setup" },
      { t: "p", x: "Reason for the buy? Price swept the previous low into the 696 to 697 demand zone, giving a bullish setup for a move higher." },
      { t: "h", x: "Example 3" },
      { t: "h", x: "What does \"sweep\" mean?" },
      { t: "p", x: "A sweep is when price briefly moves beyond an obvious previous high or low, often taking out the orders around that level, before reversing. On the left side of the chart, price pushes above a previous high. The idea being illustrated:" },
      { t: "quote", x: "Old high → price pushes above it → liquidity is taken → price reverses" },
      { t: "p", x: "For a beginner, think of it as price cleaning out the orders around an obvious level. A sweep by itself is not necessarily a reason to enter a trade: you normally want additional confirmation." },
      { t: "h", x: "What does \"break\" mean?" },
      { t: "p", x: "The Break labels point to places where price breaks an important previous swing or structure level. For example:" },
      { t: "quote", x: "Higher high → higher low → price breaks below the previous low" },
      { t: "p", x: "That can indicate that the previous upward structure has changed. It is often called a break of structure (BOS) or, depending on the trader's terminology, a market structure break." },
      { t: "h", x: "What is \"inducement liquidity\"?" },
      { t: "p", x: "This is a more advanced concept. Price creates an obvious swing or setup that attracts traders into positions, creating liquidity around that area. In the screenshot, the Inducement Liquidity label sits around an intermediate price structure before the larger move. As a beginner, remember: inducement is an area that may attract traders before price makes the larger move." },
      { t: "note", x: "N/B: Do not treat every small swing as inducement. It must make sense within the broader market structure." },
    ],
  },
];

// ---------- Workbook (draft): one per handbook section ----------
// terms: [term, meaning]   check: [question, answer]   tasks: things to do on a chart or on paper
const WORKBOOKS = [
  {
    id: "00", goal: "Set your mindset and your working method before you start.",
    terms: [["Strategy", "A defined set of rules for when to trade, where to enter and where to exit."], ["Discipline", "Following your plan consistently instead of acting on emotion."], ["Universal concepts", "Structure, risk management and psychology apply in every market."]],
    check: [
      ["Why does the guide begin with fundamentals before the strategy?", "Because the concepts of price movement, market structure, risk and psychology are universal. They explain not only how the strategy works but why it works."],
      ["Is the aim of this guide only to give entry and exit signals?", "No. It aims to build the analytical mindset, discipline and consistency needed to trade well over the long term."],
    ],
    tasks: ["Write down, in your own words, why you want to trade Volatility Indices and what a good first three months would look like.", "Open a demo account and note its name and starting balance. You will use it for every practical task in this workbook."],
  },
  {
    id: "01", goal: "Explain what forex is and when it trades.",
    terms: [["Forex (FX)", "The global market where one currency is exchanged for another."], ["OTC market", "Over-the-counter: trading happens electronically through banks and brokers, not on a central exchange."], ["Trading sessions", "Sydney, Tokyo, London and New York. Together they keep forex open 24 hours a day, Monday to Friday."]],
    check: [
      ["Why is forex called an over-the-counter market?", "Because trades are made electronically between banks and brokers instead of on one central exchange."],
      ["Name the four trading sessions.", "Sydney, Tokyo, London and New York."],
      ["Give one real-life reason people exchange currencies besides trading.", "Travel, imports and exports, investment or cross-border payments."],
    ],
    tasks: ["List the four sessions and the time each one opens in your own time zone.", "Write two sentences explaining forex to a friend who has never heard of it."],
  },
  {
    id: "02", goal: "Read a currency pair and count pips.",
    terms: [["Base currency", "The first currency in a pair (EUR in EUR/USD)."], ["Quote currency", "The second currency in a pair (USD in EUR/USD). It is the currency the price is expressed in."], ["Major pairs", "EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, USD/CAD and NZD/USD."]],
    check: [
      ["If EUR/USD is 1.1500, what does that mean?", "One euro is worth 1.15 US dollars."],
      ["You buy EUR/USD at 1.1000 and sell at 1.1050. How many pips did you gain?", "50 pips."],
      ["Why do many traders prefer major pairs?", "They generally have the highest liquidity and the lowest spreads."],
    ],
    tasks: ["For three major pairs, write down which currency is the base and which is the quote.", "On your demo account, find the current price of EUR/USD and work out what a 20-pip move would be in price terms."],
  },
  {
    id: "03", goal: "Define pip, spread, leverage and margin, and see how they affect cost and risk.",
    terms: [["Pip", "A small price movement, usually the fourth decimal place."], ["Spread", "The difference between the bid and ask price; part of the cost of trading."], ["Leverage", "Controlling a larger position with a smaller deposit. It magnifies profits and losses."], ["Margin", "The money required to open and maintain a leveraged position."]],
    check: [
      ["What is the spread, and why does it matter?", "It is the gap between the bid and the ask price. You start every trade slightly behind because of it, so it is a cost."],
      ["Does leverage only increase profits?", "No. It increases risk too, because losses are magnified in the same way."],
      ["What is margin?", "The amount needed to open and maintain a leveraged position."],
    ],
    tasks: ["On your demo account, open the specification of one instrument and write down its spread and the margin needed for 0.01 lot.", "Explain in two sentences why a trader with high leverage can lose their account faster."],
  },
  {
    id: "04", goal: "Tell an uptrend from a downtrend and a range.",
    terms: [["Uptrend", "Higher highs and higher lows."], ["Downtrend", "Lower highs and lower lows."], ["Range", "Price moving sideways."], ["Support", "A price area where buyers have stepped in before."]],
    check: [
      ["What makes an uptrend?", "A sequence of higher highs and higher lows."],
      ["What does a ranging market look like?", "Price moving sideways without making clear higher or lower swings."],
      ["What do many traders wait for before considering a buy at support?", "For price to respect the support level."],
    ],
    tasks: ["Open a Volatility 75 chart on the 1-hour timeframe. Mark the last three swing highs and swing lows and label the market uptrend, downtrend or range.", "Repeat on the 15-minute chart. Does the trend agree with the 1-hour chart?"],
  },
  {
    id: "05", goal: "Set a risk plan before you take any trade.",
    terms: [["Position sizing", "Choosing a trade size so that a loss is a small percentage of your account."], ["Risk-to-reward", "What you stand to gain compared with what you risk. A common aim is at least 1:2."], ["Stop loss", "An order that limits your loss if price moves against you."], ["Revenge trading", "Trading to win back a loss instead of following your plan."]],
    check: [
      ["What does a 1:2 risk-to-reward ratio mean?", "You risk 1 unit to try to gain at least 2."],
      ["Name three common risk-management mistakes.", "Overleveraging, moving stop losses, revenge trading, or risking too much on one trade."],
      ["Why is a stop loss placed before the trade, not after?", "So the maximum loss is decided calmly in advance and not by emotion in the middle of the trade."],
    ],
    tasks: ["Write your own risk rules: the percentage you will risk per trade, the maximum trades per day and the daily loss at which you stop.", "Take a made-up 1,000 demo account. Work out the money you would risk at 1% and the target for a 1:2 trade."],
  },
  {
    id: "06", goal: "Spot fear and greed in yourself and start a trading journal.",
    terms: [["Discipline", "Following the plan, not the feeling."], ["Fear", "Makes traders exit too early."], ["Greed", "Makes traders hold too long or take too much risk."], ["Trading journal", "A record of every trade: reason, result and lesson."]],
    check: [
      ["How does fear usually damage a trade?", "It makes traders close winning trades too early."],
      ["How does greed usually damage a trade?", "It encourages holding positions too long."],
      ["What should a journal entry contain?", "Why the trade was entered, the result and what you learned."],
    ],
    tasks: ["Create a journal page with these columns: date, instrument, reason for entry, risk, result, lesson, how I felt.", "Fill in three demo trades, and for each one write whether you followed your plan."],
  },
  {
    id: "07", goal: "Know the basic trading vocabulary by heart.",
    terms: [["Bid", "Price at which the market buys."], ["Ask", "Price at which the market sells."], ["Lot", "Standard trading volume."], ["Liquidity", "Ease of buying or selling without significantly affecting price."], ["Volatility", "The rate at which prices change."]],
    check: [
      ["Which price do you pay when you buy: bid or ask?", "The ask, because it is the price at which the market sells."],
      ["What is liquidity?", "How easily you can buy or sell without moving the price much."],
      ["What is volatility?", "How fast and how far prices change."],
    ],
    tasks: ["Make a flashcard for each of the five terms and test yourself until you can answer without looking.", "Find the bid, the ask and the spread of one instrument on your demo platform."],
  },
  {
    id: "08", goal: "Read any candlestick and say what it suggests, in context.",
    terms: [["OHLC", "Open, High, Low, Close: the four prices a candle shows."], ["Body", "The distance between open and close."], ["Wick (shadow)", "The thin line above or below the body showing the extreme price reached."], ["Doji", "A candle where open and close are nearly equal; indecision."], ["Marubozu", "A candle with little or no wicks; strong conviction."]],
    check: [
      ["How do you know a candle is bullish?", "Its close is higher than its open."],
      ["What do long wicks often indicate?", "Rejection of a price level."],
      ["Hammer and hanging man look the same. How do they differ?", "A hammer appears after a downtrend and suggests a bullish reversal; a hanging man appears after an uptrend and suggests a possible bearish reversal."],
      ["Why should a candlestick not be used alone as a signal?", "Because it must be read with market structure, support and resistance, trend direction and risk management."],
    ],
    tasks: ["On a chart, find and mark one example each of a long bullish candle, a long bearish candle, a doji, a hammer or shooting star, and a marubozu.", "For each candle you marked, write what it suggests and what extra confirmation you would need before trading it."],
  },
  {
    id: "09", goal: "Describe how Volatility Indices work and pick a suitable one.",
    terms: [["Volatility Index", "A synthetic instrument that simulates a constant level of volatility."], ["RNG", "Random Number Generator. A cryptographically secure one produces the price movement."], ["1-second index", "A version of an index that updates every second, so price moves faster."]],
    check: [
      ["What generates the price of a Volatility Index?", "A cryptographically secure Random Number Generator."],
      ["Do economic news and interest-rate decisions move these indices?", "No. They are not influenced by news, geopolitics or sentiment."],
      ["What does the 75 in Volatility 75 stand for?", "Its constant simulated volatility level of 75%."],
      ["Who are the 1-second indices attractive to?", "Short-term traders and scalpers."],
    ],
    tasks: ["Open Volatility 10 and Volatility 100 on the same timeframe and compare the size of the candles. Write down what you notice.", "Choose the index you will study first, and write two sentences on why it matches your risk tolerance."],
  },
  {
    id: "10", goal: "Name every SMC concept and walk through the eight-step analysis.",
    terms: [["Market structure", "The sequence of HH, HL, LH and LL swings."], ["Liquidity", "Areas where many orders sit: previous highs and lows, equal highs and lows, stop-loss clusters."], ["Order block", "The final opposite candle before a strong move."], ["Breaker block", "An order block that failed and changed its role."], ["Fair value gap", "A three-candle imbalance where the wicks of candles 1 and 3 do not overlap."], ["BOS", "A break of a swing level in the direction of the structure."], ["ChoCH", "An early sign of a change in price behaviour."], ["Premium / discount", "The upper and lower halves of a range, split at equilibrium."]],
    check: [
      ["What is the difference between BOS and ChoCH?", "A BOS breaks a swing level in the direction of the prevailing structure (continuation). A ChoCH is an early break against it, hinting that behaviour is changing."],
      ["Where is a bullish order block usually found?", "At the final bearish candle before a strong bullish move."],
      ["What is a liquidity sweep?", "Price moves through an obvious high or low, triggers the orders there, then reverses."],
      ["Where do bullish traders look to buy: premium or discount?", "In discount areas."],
      ["Does finding an FVG or order block guarantee a profitable trade?", "No. They need to line up with structure and liquidity, and risk management is still essential."],
    ],
    tasks: ["Take one chart and run the eight steps in order: higher-timeframe structure, liquidity, interaction with liquidity, BOS or ChoCH, zone, premium or discount, confirmation, risk. Write one line for each.", "Mark every fair value gap you can find on a 15-minute chart and note whether price later returned to it.", "Draw the range of the last swing and mark equilibrium. Is the current price in premium or discount?"],
  },
  {
    id: "11", goal: "Explain a setup on a real chart from start to finish.",
    terms: [["Sweep", "Price briefly moves beyond an obvious high or low, then reverses."], ["Break", "Price breaks an important swing or structure level."], ["Inducement liquidity", "A small, obvious swing that attracts traders before the larger move."], ["Demand zone", "A price area where buying interest is expected."]],
    check: [
      ["Put Example 2 in order.", "Structure forms, liquidity is created, price sweeps the low, price enters the demand zone, buy setup."],
      ["Is a sweep alone a reason to enter?", "No. You normally want additional confirmation."],
      ["What is the beginner's way to remember inducement?", "An area that may attract traders before price makes the larger move."],
    ],
    tasks: ["Find one setup of your own on a demo chart, screenshot it, and mark the structure, the liquidity, the sweep, the zone and the invalidation level.", "Write the reason for the trade in one sentence, the way Example 2 does, and what would prove you wrong."],
  },
];

const IDS = SECTIONS.map((s) => s.id);

// What the handbook screen needs for the list (without the long blocks).
const FINAL = {
  title: "You have finished the Multi-FX handbook",
  paragraphs: [
    "You now know the fundamentals, the Volatility Indices and the Smart Money Concept framework.",
    "Do the workbooks, attend the live classes, then test yourself with the quiz. Always define your risk before you enter a trade.",
  ],
};

module.exports = { SECTIONS, WORKBOOKS, IDS, FINAL };
