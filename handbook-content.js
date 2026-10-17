// The Edge Handbook as shown in the student portal (Mentorship Handbook).
// Source: "ABEC FX - The Edge Handbook & Complete Workbook" PDF (served at /handbook.pdf).
// Text and tables are copied from the PDF; charts, fill-in exercises and signature pages stay in
// the PDF (each chapter links to it). Each section below is one "step" of a student's progress:
// Introduction (00) + chapters 01-12 = 13 steps. Add or remove a section and progress adjusts itself.
//
// Block types: p (paragraph), h (sub-heading), ul, ol, table (head + rows), cards, note, quote.

const CHAPTERS = [
  {
    id: "00", title: "Introduction & Philosophy",
    tagline: "Building Traders From the Base Up. Sharpening Them at the Edge.",
    blocks: [
      { t: "p", x: "Adebass Base Edge Consult FX (ABEC FX) was founded on a simple but powerful belief: Great traders are not born, they are built from a strong foundation." },
      { t: "p", x: "In a world where many chase quick profits, signal services, and shortcut strategies, ABEC FX focuses on what truly creates long-term success: structure, discipline, psychology, and repeatable systems." },
      { t: "quote", x: "We do not train gamblers. We develop calculated decision-makers." },
      { t: "p", x: "At ABEC FX, trading is approached as a professional skill, one that can be learned, refined, and mastered through the right guidance and consistent practice." },
      { t: "h", x: "Our philosophy" },
      { t: "p", x: "The market rewards preparation, not emotion. Every movement leaves clues, through trend behavior, volatility, liquidity, and timing. Our role is not to predict blindly, but to read these clues and respond with precision." },
      { t: "h", x: "ABEC FX emphasizes" },
      { t: "ul", items: ["Structured trade plans", "High-probability setups", "Risk management mastery", "Multi-timeframe analysis", "Emotional control", "Patience and execution discipline"] },
      { t: "p", x: "Because consistency is never an accident, it is engineered." },
      { t: "h", x: "Why 'Base Edge'?" },
      { t: "p", x: "Before any structure can stand tall, it must sit on a solid base. Many traders fail not because trading is too difficult, but because their foundation is weak." },
      { t: "p", x: "At ABEC FX, we reverse that pattern, ensuring every student understands why a trade is taken, not just when to enter. The 'edge' is what separates a disciplined trader from a reactive one." },
      { t: "h", x: "When your base is strong" },
      { t: "cards", items: [
        { h: "Fear", x: "Reduces. Knowledge replaces it." },
        { h: "Decisions", x: "Become clearer. Structure removes hesitation." },
        { h: "Losses", x: "Become manageable. Risk control protects you." },
        { h: "Profits", x: "Become repeatable. Systems replace luck." },
      ] },
      { t: "h", x: "Our mission" },
      { t: "p", x: "To transform aspiring traders into disciplined market professionals capable of navigating volatility with clarity and confidence." },
      { t: "h", x: "Who this handbook is for" },
      { t: "ul", items: ["A beginner seeking clear direction and a structured starting point", "An intermediate trader struggling with consistency and emotional control", "A developing professional refining their edge for real market conditions"] },
      { t: "note", x: "Do not rush this material. Study it. Revisit it. Apply it. Build your base, sharpen your edge, and the markets become far less intimidating." },
    ],
  },
  {
    id: "01", title: "MT5 Indicator Configuration",
    tagline: "Before you read a single candle, your chart must be set up correctly.",
    blocks: [
      { t: "p", x: "When we open MT4/MT5, this is how we set up our indicators. These three tools form the visual language you will use to read every trade in this system." },
      { t: "h", x: "Bollinger Bands" },
      { t: "p", x: "Set the period to 20 and deviation to 2. Color: Green. On your chart this appears as three green lines: upper, middle, and lower band." },
      { t: "h", x: "Moving Average: Simplified (SMA)" },
      { t: "p", x: "Go to Moving Average, choose Simplified. Period 10, color Red. This is your SMA, the steady, short-term trend line." },
      { t: "h", x: "Moving Average: Exponential (EMA)" },
      { t: "p", x: "Add another Moving Average, set to Exponential. Period 10, color Blue. This is your EMA, faster and more responsive to recent price movement." },
      { t: "note", x: "Once configured, your chart will show: three green lines (Bollinger Bands), one red line (SMA), and one blue line (EMA). If you see all five lines, you are ready." },
      { t: "table", head: ["Indicator", "Type", "Period", "Color", "Role"], rows: [
        ["Bollinger Bands", "Bands", "20", "Green", "Price boundaries & volatility"],
        ["Moving Average", "Simplified (SMA)", "10", "Red", "Short-term trend direction"],
        ["Moving Average", "Exponential (EMA)", "10", "Blue", "Fast momentum indicator"],
      ] },
    ],
  },
  {
    id: "02", title: "Understanding Moving Averages",
    tagline: "A tool that removes noise and reveals direction. Simple to read. Powerful when respected.",
    blocks: [
      { t: "p", x: "A Moving Average calculates the average price of an asset over a specific period, updating continuously. It filters out short-term noise and reveals the underlying trend." },
      { t: "h", x: "Two analogies" },
      { t: "cards", items: [
        { h: "School grades", x: "Imagine checking your average grade over the last 5 tests. Every new test drops the oldest and re-averages the latest 5. That rolling average reveals whether your trend is improving or declining." },
        { h: "Weather average", x: "A 7-day temperature average tells you whether it's getting hotter or colder overall. The MA does the same for price, smoothing spikes to reveal the genuine direction." },
      ] },
      { t: "h", x: "Red vs blue line" },
      { t: "cards", items: [
        { h: "Red line: SMA", x: "Simple Moving Average. Pure average of the last 10 periods. Slower to react, giving a stable, noise-free read on trend direction." },
        { h: "Blue line: EMA", x: "Exponential Moving Average. Weights recent prices more, so it reacts faster. It signals momentum shifts before the SMA catches up." },
      ] },
      { t: "h", x: "The three possible trends" },
      { t: "cards", items: [
        { h: "Uptrend", x: "MA clearly curving upward. Price building higher. Follow it, trade Crash." },
        { h: "Downtrend", x: "MA curving down. Price declining. Follow it, trade Boom." },
        { h: "Sideways", x: "MA flat. No clear direction. Stay out, no trade." },
      ] },
      { t: "quote", x: "A moving average filters out the random ups and downs and shows whether the market is trending up, down, or going nowhere." },
    ],
  },
  {
    id: "03", title: "Bollinger Bands: The Boundary System",
    tagline: "Three lines that reveal price range, volatility, and when the market is overextended.",
    blocks: [
      { t: "p", x: "Bollinger Bands reveal when price is stretching too far from its normal range, and when the market is quiet, building pressure for its next move." },
      { t: "h", x: "The three bands" },
      { t: "cards", items: [
        { h: "Upper band: the ceiling", x: "Where price is getting expensive. When price reaches here, it's overextended." },
        { h: "Middle band: center line", x: "The moving average, the market's center of gravity and trend direction." },
        { h: "Lower band: the floor", x: "Where price is getting cheap. When price reaches here, it's stretched low." },
      ] },
      { t: "h", x: "Two analogies" },
      { t: "cards", items: [
        { h: "Rubber band", x: "Pull it too far and it snaps back. Price does the same. Upper band = stretched high. Lower band = stretched low. Markets don't stay overextended for long." },
        { h: "Personal space", x: "Wide bands = high activity. Tight bands = quiet market, often preparing for a big move. The 'squeeze' before the breakout is one of the most powerful signals." },
      ] },
      { t: "h", x: "Band width as a signal" },
      { t: "cards", items: [
        { h: "Wide bands", x: "High volatility. Active market. Setups form fast and close fast. Stay disciplined." },
        { h: "Tight bands (squeeze)", x: "Quiet market, but often the calm before a big move. Pay close attention." },
      ] },
      { t: "quote", x: "Is the market calm or explosive? Is price normal... or is it stretching too far?" },
    ],
  },
  {
    id: "04", title: "How to Identify Trend Direction",
    tagline: "Professionals don't predict. They read what the market is already saying.",
    blocks: [
      { t: "p", x: "The middle Bollinger Band quietly tells you the current trend direction, simply through the direction it is curving. Think of it like a road." },
      { t: "h", x: "Uptrend: middle band curving up" },
      { t: "p", x: "The middle Bollinger Band is curving upward. Current price is floating above it. Bullish structure, trade Crash." },
      { t: "h", x: "Downtrend: middle band curving down" },
      { t: "p", x: "The middle Bollinger Band is curving downward. Current price is sinking below it. Bearish structure, trade Boom." },
      { t: "h", x: "Sideways: flat middle band (no trade)" },
      { t: "p", x: "The middle band becomes flat. Price crosses above and below it repeatedly. No direction = no trade. Close the chart." },
      { t: "table", head: ["Condition", "Signal", "Action"], rows: [
        ["Middle band UP + price above", "UPTREND", "Trade Crash (Buy)"],
        ["Middle band DOWN + price below", "DOWNTREND", "Trade Boom (Sell)"],
        ["Flat band + price crossing both ways", "SIDEWAYS", "Close chart, No Trade"],
      ] },
    ],
  },
  {
    id: "05", title: "Key Points Before Taking a Trade",
    tagline: "A valid setup is not a feeling. It is a series of confirmed conditions, all aligned.",
    blocks: [
      { t: "p", x: "Every trade in this system must meet specific conditions. If even one is missing, the setup is not valid. No exceptions." },
      { t: "h", x: "Condition 1: SMA/EMA crossover" },
      { t: "p", x: "The blue (EMA) and red (SMA) lines must confirm the trend. Both must curve in the same direction." },
      { t: "cards", items: [
        { h: "Boom chart (sell)", x: "Blue stays BELOW red, both curving downward, valid downtrend." },
        { h: "Crash chart (buy)", x: "Blue stays ABOVE red, both curving upward, valid uptrend." },
      ] },
      { t: "h", x: "Condition 2: EMA + middle Bollinger Band crossover" },
      { t: "p", x: "The blue EMA must cross the Middle Bollinger Band in your trade direction. Wait for confirmation." },
      { t: "cards", items: [
        { h: "Boom chart", x: "Middle BB must be BELOW the blue MA, wait for blue to drop below before entering." },
        { h: "Crash chart", x: "Middle BB must be ABOVE the blue MA, wait for blue to rise above before entering." },
      ] },
      { t: "h", x: "Condition 3: outer Bollinger Band exit" },
      { t: "cards", items: [
        { h: "Crash: exit", x: "Price touches UPPER band, secure profit, exit." },
        { h: "Boom: exit", x: "Price touches LOWER band, take profit, exit." },
      ] },
      { t: "h", x: "Additional trading laws" },
      { t: "ol", items: ["Never trade against the trend.", "Avoid consolidation: sideways market equals unnecessary risk.", "Trade with patience. Let the market confirm, then commit.", "Stay on M30 and H1 only. No noise."] },
    ],
  },
  {
    id: "06", title: "Trade Entry Checklist: Beginner",
    tagline: "A checklist is not a crutch. It is the discipline of professionals.",
    blocks: [
      { t: "p", x: "Use this checklist before every trade. If any box cannot be ticked, do not enter." },
      { t: "h", x: "Pre-trade verification" },
      { t: "ul", items: [
        "Open chart on M30 or H1",
        "Middle BB curving UP (uptrend) or DOWN (downtrend), NOT flat",
        "Trend confirmed: UP or DOWN",
        "Instrument matches the trend (Boom=Down, Crash=Up)",
        "Both MAs curving in the same direction as the trend",
      ] },
      { t: "h", x: "Boom and Crash entry: confirmed when" },
      { t: "cards", items: [
        { h: "Boom: blue must be below everything", x: "All MAs curving downward. Blue MA below Middle BB. Blue MA below Red MA. Enter sell trade." },
        { h: "Crash: blue must be above everything", x: "All MAs curving upward. Blue MA above Middle BB. Blue MA above Red MA. Enter buy trade." },
      ] },
      { t: "note", x: "Trend not clear. Middle BB is flat. Moving averages not aligned. No confirmation = No trade. Full stop." },
    ],
  },
  {
    id: "07", title: "Stop Loss Rules",
    tagline: "A stop loss is not an admission of failure. It is the professional's most important tool.",
    blocks: [
      { t: "p", x: "On Boom and Crash, we don't set random stop loss parameters. Your stop loss must be controlled, either by the guide below, or by actively monitoring and closing the moment it hits your limit." },
      { t: "h", x: "Stop loss guide" },
      { t: "table", head: ["Lot size", "Maximum stop loss (in USD)"], rows: [["0.2 lot", "$5"], ["0.5 - 1.0 lot", "$10"]] },
      { t: "note", x: "This is not a suggestion. It is a rule. Once your loss hits the limit, you close. No hoping. No emotional holding. No 'it will come back.' You close and move on." },
      { t: "h", x: "Account size protection" },
      { t: "p", x: "For accounts with $50 - $100 equity, stop loss must stay between $5 - $10 maximum. Never risk more than 10% of your capital per trade. Protect the account first." },
      { t: "h", x: "Why defining SL by lot size works" },
      { t: "p", x: "Defining your stop loss by lot size keeps your risk per trade under control. You know what you're willing to lose before you enter, so you hold with confidence, not fear. That psychological clarity is worth more than most strategies." },
      { t: "quote", x: "We will take losses. But we make more than we lose. The goal is consistency: more wins than losses." },
      { t: "note", x: "Protect your account. Opportunities are endless. Capital is not." },
    ],
  },
  {
    id: "08", title: "Retest Zones & Bollinger Band Boundaries",
    tagline: "Price doesn't move randomly. It moves between zones, and knowing those zones is your edge.",
    blocks: [
      { t: "p", x: "A retest zone is a spot where price usually stops and changes direction. In Boom & Crash, we use the 3 Bollinger Bands as our primary retest zones." },
      { t: "h", x: "The three retest zones" },
      { t: "cards", items: [
        { h: "Upper band: ceiling", x: "Price reaching here signals overextension high. Expect bounce or reversal." },
        { h: "Middle band: balance", x: "Center of gravity. Price frequently returns here after touching either outer band." },
        { h: "Lower band: floor", x: "Price reaching here signals overextension low. Expect bounce or reversal upward." },
      ] },
      { t: "h", x: "How price behaves at retest zones" },
      { t: "cards", items: [
        { h: "Bounce behavior", x: "Price hits a BB zone and reverses direction. Trend reacting, possible change." },
        { h: "Breakout behavior", x: "Price pushes through and beyond the outer band. Trend continuing with strong momentum." },
      ] },
      { t: "h", x: "How to use retest zones" },
      { t: "ol", items: [
        "Get an overall view of market structure: is the market respecting its Bollinger Band boundaries?",
        "Set Take Profit (TP) at retest zones: price going up: TP near upper or middle band. Going down: TP near lower or middle band.",
        "Use zone behavior to decide whether to hold, scale out, or exit early.",
      ] },
      { t: "quote", x: "Retest zones tell you WHERE the trend might pause or reverse. Use them to set TP and manage trades with precision." },
    ],
  },
  {
    id: "09", title: "Higher Timeframe Analysis (H4 & D1)",
    tagline: "The bigger the timeframe, the louder the signal. Always know what the senior charts are saying.",
    blocks: [
      { t: "p", x: "When price is near Bollinger Band edges, always check the bigger picture. Higher timeframes tell you how price is likely to behave at a retest zone before you commit." },
      { t: "h", x: "The two-step process" },
      { t: "ol", items: ["Check the H4 trend: does it match your M30/H1 direction?", "Check the D1 trend: is it also aligned with your main chart?"] },
      { t: "h", x: "Alignment rules" },
      { t: "cards", items: [
        { h: "Higher TF aligns", x: "H4 or D1 matches your M30/H1 trend: expect a BB breakout. Trade with more confidence. Hold longer." },
        { h: "Higher TF does not align", x: "Setup may still be valid: enter, but monitor closely and manage aggressively. Don't hold as long." },
      ] },
      { t: "h", x: "The traffic light system" },
      { t: "cards", items: [
        { h: "Green", x: "Both H4 and D1 align: full confidence. Expect a strong breakout." },
        { h: "Yellow", x: "One TF aligns: go, but stay alert and manage actively." },
        { h: "Red", x: "Higher TFs conflict: skip or manage with extreme caution." },
      ] },
      { t: "h", x: "Case study: Boom 1000 (H1 + H4 + D1)" },
      { t: "p", x: "Below is a live multi-timeframe analysis on Boom 1000. The H1 chart shows price touching the lower Bollinger Band. Before entering, we check H4 and D1. (The H1, H4 and D1 charts are in the PDF.)" },
      { t: "note", x: "Decision: Despite H1 touching the lower band, H4 and D1 both show strong downtrend and are not at retest zones, we confidently enter the Boom trade. All three timeframes aligned." },
      { t: "quote", x: "Higher TF free: expect strong breakout. Higher TF at retest: expect resistance, manage carefully." },
    ],
  },
  {
    id: "10", title: "Pro Trade Entry Checklist",
    tagline: "The complete, professional-grade checklist. Every step. Every time. No shortcuts.",
    blocks: [
      { t: "p", x: "Once you have mastered the beginner checklist, this is your standard. It adds the higher timeframe layer, making every decision more informed and precise." },
      { t: "h", x: "Full pro checklist" },
      { t: "table", head: ["Step", "Check", "Rule"], rows: [
        ["1", "Timeframe", "Open chart on M30 or H1"],
        ["2", "Trend ID", "Middle BB curving UP or DOWN. Flat = skip immediately."],
        ["3", "Instrument rule", "Boom = Downtrend only. Crash = Uptrend only. Wrong match = close chart."],
        ["4", "MA confirmation", "Boom: Blue below MBB and Red MA. Crash: Blue above MBB and Red MA."],
        ["5", "Price at BB edge?", "If YES, run Top-Down Analysis on H4 and D1 before entering."],
        ["6", "H4 & D1 check", "Higher TF aligns = confidence, hold longer. Doesn't align = manage aggressively."],
      ] },
      { t: "note", x: "Trend not clear. Middle BB flat. MAs not aligned. No confirmation = No trade." },
    ],
  },
  {
    id: "11", title: "Risk Management & Trading Psychology",
    tagline: "If you don't know how to control your losses, the market will teach you the hard way.",
    blocks: [
      { t: "p", x: "Risk management means managing your losses, controlling your emotions, and sticking to your plan so one bad trade doesn't damage your account." },
      { t: "h", x: "The ten rules of trading discipline" },
      { t: "ol", items: [
        "Always have a trading plan. Know why you're entering and where you're exiting, before you touch the market.",
        "Keep learning and sharpening your skills. The market evolves, and so should you.",
        "Trade only with money you can afford to lose. Never put yourself under financial pressure.",
        "Set realistic profit expectations. Consistency beats chasing big wins every time.",
        "Always use a Stop Loss. Capital protection is priority number one.",
        "Secure your profits. Take profit when it makes sense. Use trailing stops to protect gains.",
        "Respect leverage. It can grow your account fast, but drain it faster if misused.",
        "Control your emotions. Fear and greed are the most expensive habits in this business.",
        "Don't overexpose one setup. Be strategic with how you distribute your risk.",
        "Hope for the best, but always prepare for the worst. Think in probabilities, not guarantees.",
      ] },
      { t: "h", x: "Before every trade, calculate these" },
      { t: "cards", items: [
        { h: "Risk per trade", x: "Know the exact dollar amount you're willing to lose. Non-negotiable." },
        { h: "Lot size match", x: "Your lot size must match your risk tolerance. Never oversize." },
        { h: "Position sizing", x: "Your position must respect your equity. Protect the account first." },
        { h: "Account longevity", x: "Your account should survive 5 - 10 losses without being wiped out." },
      ] },
      { t: "quote", x: "In trading, survival is what leads to profitability. Trade smart. Protect your capital. Stay consistent." },
    ],
  },
  {
    id: "12", title: "Volatility Levels & Lot Size Guide",
    tagline: "Volatility controls your risk. The more volatile the index, the more disciplined you must be.",
    blocks: [
      { t: "p", x: "Before you touch any chart, understand this: volatility controls your risk. Don't oversize. Let the market respect you by respecting your risk first." },
      { t: "note", x: "Important Warning: This list can change at any time. Always verify the latest specifications from your broker before placing any trade." },
      { t: "h", x: "Very volatile: trade with extra caution" },
      { t: "table", head: ["Instrument", "Recommended lot size"], rows: [
        ["Volatility 100 Index", "0.50"], ["Volatility 75 Index", "0.001"], ["Volatility 50 (1s)", "0.005"],
        ["Volatility 25 (1s)", "0.005"], ["Volatility 50 Index", "4.00"], ["Volatility 250 (1s)", "0.005"],
        ["Jump 25", "0.01"], ["Jump 75", "0.01"], ["Boom 1000", "0.20"], ["Boom 300", "0.50"],
        ["Crash 300", "0.50"], ["Step Index", "0.10"], ["Crash 600", "0.20"], ["Crash 900", "0.20"],
      ] },
      { t: "p", x: "On these pairs, reduce greed, respect your stop loss, and secure profits early." },
      { t: "h", x: "Less volatile: balanced movement" },
      { t: "table", head: ["Instrument", "Recommended lot size"], rows: [
        ["Volatility 25", "0.50"], ["Volatility 100 (1s)", "0.20"], ["Volatility 75 (1s)", "0.05"],
        ["Volatility 10 (1s)", "0.50"], ["Jump 50", "0.01"], ["Crash 1000", "0.20"], ["Crash 500", "0.20"],
        ["Boom 900", "0.20"], ["Boom 600", "0.20"], ["Boom 500", "0.20"],
      ] },
      { t: "p", x: "Cleaner setups, but risk management still fully applies." },
      { t: "h", x: "Lower volatility: more stable (never risk-free)" },
      { t: "table", head: ["Instrument", "Recommended lot size"], rows: [
        ["Volatility 10", "0.50"], ["Volatility 150 (1s)", "0.01"], ["Jump 10", "0.01"],
        ["Jump 100", "0.01"], ["Crash 150", "0.50"], ["Boom 150", "0.50"],
      ] },
      { t: "p", x: "Stability does not mean safety. Always trade with confirmation." },
      { t: "quote", x: "High volatility + big lot size = unnecessary danger. Controlled lot size + patience = longevity in the market." },
    ],
  },
];

const FINAL = {
  title: "A Final Word Before You Trade",
  paragraphs: [
    "The market does not reward excitement. It rewards discipline. The market does not care about your feelings. It rewards preparation.",
    "You now have the knowledge. You have the system. You have the checklist.",
    "What separates the traders who make it from those who don't is not intelligence. It is the willingness to execute consistently, protect capital relentlessly, and learn from every trade without letting emotion make the decisions.",
    "Do not rush this material. Return to it. Apply it. Let the system work for you. Build your base. Sharpen your edge. Welcome to ABEC FX.",
  ],
};

const IDS = CHAPTERS.map((c) => c.id);

module.exports = { CHAPTERS, FINAL, IDS };
