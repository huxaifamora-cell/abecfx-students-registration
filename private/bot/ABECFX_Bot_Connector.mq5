//+------------------------------------------------------------------+
//|                                       ABECFX_Bot_Connector.mq5   |
//|  Connects this MetaTrader 5 account to your ABEC-FX portal.      |
//+------------------------------------------------------------------+
// What it does (and nothing else):
//   * every few seconds it sends the website your account details, your bot's open trades and closed trades;
//   * it opens the trades the website asks for, using the lot size, stop loss, take profit and number of
//     positions you set in the portal's "Bot trading" page;
//   * COPY TRADING (Alumni members): it opens, changes and closes copies of your chosen master's trades, using
//     the fixed lot size you set on the portal's "Copy trading" page. A copy carries the comment C<master>-<ticket>.
//   * MASTER MODE (staff and mentors): when the connection key starts with MK-, it only REPORTS all of your own
//     open and closed trades so that followers can copy them. In this mode it never opens, changes or closes anything.
// It never reads or sends your MT5 password. It only touches trades that carry its own magic number
// (in master mode it only reads).
//
// Setup:
//   1. Tools > Options > Expert Advisors > tick "Allow WebRequest for listed URL" and add the website address below.
//   2. Also tick "Allow Algo Trading" and press the "Algo Trading" button on the toolbar so it is green.
//   3. Drag this connector onto ANY chart, paste your connection key from the portal, and press OK.
//   4. Keep MT5 open (a VPS is best). If MT5 is closed, the bot cannot trade.
#property copyright "ABEC-FX"
#property link      "__SERVER_URL__"
#property version   "1.10"
#property strict

#include <Trade\Trade.mqh>

input string InpServerUrl   = "__SERVER_URL__"; // Website address (do not change)
input string InpBotKey      = "";               // Connection key from the portal
input int    InpPollSeconds = 5;                // Seconds between reports
input long   InpMagic       = 5742001;          // Magic number of the bot's trades (do not change)

CTrade   gTrade;
string   gResults   = "";   // finished order results waiting to be sent: {"id":"..","opened":1,"error":""},...
datetime gLastSync  = 0;    // closed trades older than this have already been sent
string   gStatus    = "Starting...";
bool     gBadKey    = false;
bool     gMaster    = false;   // the key starts with MK-: report only, never trade

//+------------------------------------------------------------------+
string JsonEsc(string s)
{
   string out = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
   {
      ushort c = StringGetCharacter(s, i);
      if(c == '\\') out += "\\\\";
      else if(c == '"') out += "\\\"";
      else if(c < 32) out += " ";
      else out += ShortToString(c);
   }
   return out;
}

string Num(double v, int digits = 2)
{
   return DoubleToString(v, digits);
}

string SyncKey()
{
   return "ABECFX_SYNC_" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN));
}

void ShowStatus(string s)
{
   gStatus = s;
   Comment("ABEC-FX bot connector\n", s);
}

//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpBotKey) < 10)
   {
      ShowStatus("Paste your connection key in the connector's Inputs.");
      Print("ABEC-FX: no connection key. Open the portal's Bot trading page and press Link account.");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(StringFind(InpServerUrl, "https://") != 0)
   {
      Print("ABEC-FX: the website address must start with https://");
      return(INIT_PARAMETERS_INCORRECT);
   }
   if(GlobalVariableCheck(SyncKey())) gLastSync = (datetime)(long)GlobalVariableGet(SyncKey());
   gMaster = (StringFind(InpBotKey, "MK-") == 0);
   gTrade.SetExpertMagicNumber(InpMagic);
   gTrade.SetDeviationInPoints(100);
   EventSetTimer(MathMax(2, InpPollSeconds));
   ShowStatus("Connecting...");
   OnTimer();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
}

//+------------------------------------------------------------------+
// The report: account, the bot's open positions, the bot's recently closed trades, and order results.
string BuildPositions()
{
   string items = "";
   for(int i = 0; i < PositionsTotal() && i < 100; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!gMaster && (long)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue; // a master reports every trade
      if(items != "") items += ",";
      long type = PositionGetInteger(POSITION_TYPE);
      items += "{\"ticket\":\"" + IntegerToString((long)ticket) + "\""
             + ",\"symbol\":\"" + JsonEsc(PositionGetString(POSITION_SYMBOL)) + "\""
             + ",\"type\":\"" + (type == POSITION_TYPE_BUY ? "BUY" : "SELL") + "\""
             + ",\"lots\":" + Num(PositionGetDouble(POSITION_VOLUME))
             + ",\"openTime\":" + IntegerToString((long)PositionGetInteger(POSITION_TIME))
             + ",\"openPrice\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), 8)
             + ",\"sl\":" + Num(PositionGetDouble(POSITION_SL), 8)
             + ",\"tp\":" + Num(PositionGetDouble(POSITION_TP), 8)
             + ",\"profit\":" + Num(PositionGetDouble(POSITION_PROFIT))
             + ",\"swap\":" + Num(PositionGetDouble(POSITION_SWAP))
             + ",\"comment\":\"" + JsonEsc(PositionGetString(POSITION_COMMENT)) + "\"}";
   }
   return "[" + items + "]";
}

struct ClosedDeal
{
   ulong    deal;
   ulong    position;
   string   symbol;
   string   type;
   double   lots;
   datetime closeTime;
   double   closePrice;
   double   profit;
   double   swap;
};

string BuildClosed()
{
   datetime from = (gLastSync > 0) ? gLastSync - 3600 : TimeCurrent() - 7 * 86400;
   if(!HistorySelect(from, TimeCurrent() + 60)) return "[]";
   ClosedDeal list[];
   int total = HistoryDealsTotal();
   int kept = 0;
   for(int i = total - 1; i >= 0 && kept < 200; i--)
   {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      if(!gMaster && (long)HistoryDealGetInteger(d, DEAL_MAGIC) != InpMagic) continue;
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
      long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
      ArrayResize(list, kept + 1);
      list[kept].deal = d;
      list[kept].position = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
      list[kept].symbol = HistoryDealGetString(d, DEAL_SYMBOL);
      list[kept].type = (dtype == DEAL_TYPE_SELL) ? "BUY" : "SELL"; // a sell deal closes a buy position
      list[kept].lots = HistoryDealGetDouble(d, DEAL_VOLUME);
      list[kept].closeTime = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      list[kept].closePrice = HistoryDealGetDouble(d, DEAL_PRICE);
      list[kept].profit = HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION) + HistoryDealGetDouble(d, DEAL_FEE);
      list[kept].swap = HistoryDealGetDouble(d, DEAL_SWAP);
      kept++;
   }
   string items = "";
   for(int k = 0; k < kept; k++)
   {
      // the opening deal of the same position gives the open time, open price and the order id (its comment)
      double openPrice = 0;
      datetime openTime = 0;
      string comment = "";
      if(HistorySelectByPosition(list[k].position))
      {
         for(int j = 0; j < HistoryDealsTotal(); j++)
         {
            ulong dd = HistoryDealGetTicket(j);
            if(dd == 0) continue;
            if(HistoryDealGetInteger(dd, DEAL_ENTRY) == DEAL_ENTRY_IN)
            {
               openPrice = HistoryDealGetDouble(dd, DEAL_PRICE);
               openTime = (datetime)HistoryDealGetInteger(dd, DEAL_TIME);
               comment = HistoryDealGetString(dd, DEAL_COMMENT);
               break;
            }
         }
      }
      if(items != "") items += ",";
      items += "{\"position\":\"" + IntegerToString((long)list[k].position) + "\""
             + ",\"deal\":\"" + IntegerToString((long)list[k].deal) + "\""
             + ",\"symbol\":\"" + JsonEsc(list[k].symbol) + "\""
             + ",\"type\":\"" + list[k].type + "\""
             + ",\"lots\":" + Num(list[k].lots)
             + ",\"openTime\":" + IntegerToString((long)openTime)
             + ",\"openPrice\":" + Num(openPrice, 8)
             + ",\"closeTime\":" + IntegerToString((long)list[k].closeTime)
             + ",\"closePrice\":" + Num(list[k].closePrice, 8)
             + ",\"profit\":" + Num(list[k].profit)
             + ",\"swap\":" + Num(list[k].swap)
             + ",\"comment\":\"" + JsonEsc(comment) + "\"}";
   }
   return "[" + items + "]";
}

string BuildReport()
{
   bool real = ((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_REAL);
   string acc = "{\"login\":\"" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LOGIN)) + "\""
              + ",\"name\":\"" + JsonEsc(AccountInfoString(ACCOUNT_NAME)) + "\""
              + ",\"server\":\"" + JsonEsc(AccountInfoString(ACCOUNT_SERVER)) + "\""
              + ",\"company\":\"" + JsonEsc(AccountInfoString(ACCOUNT_COMPANY)) + "\""
              + ",\"currency\":\"" + JsonEsc(AccountInfoString(ACCOUNT_CURRENCY)) + "\""
              + ",\"leverage\":" + IntegerToString((long)AccountInfoInteger(ACCOUNT_LEVERAGE))
              + ",\"real\":" + (real ? "true" : "false")
              + ",\"balance\":" + Num(AccountInfoDouble(ACCOUNT_BALANCE))
              + ",\"equity\":" + Num(AccountInfoDouble(ACCOUNT_EQUITY))
              + ",\"margin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN))
              + ",\"freeMargin\":" + Num(AccountInfoDouble(ACCOUNT_MARGIN_FREE))
              + ",\"profit\":" + Num(AccountInfoDouble(ACCOUNT_PROFIT)) + "}";
   return "{\"account\":" + acc + ",\"positions\":" + BuildPositions() + ",\"closed\":" + BuildClosed() + ",\"results\":[" + gResults + "]}";
}

//+------------------------------------------------------------------+
// Open one order from the website. Returns the number of positions opened; `error` says what stopped it.
int RunOrder(string symbol, string side, double lots, double slAmount, double tpAmount, int count, int ttlSeconds, string orderId, string &error)
{
   error = "";
   ulong deadline = GetTickCount64() + (ulong)ttlSeconds * 1000;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
   {
      error = "Algo trading is switched off in MT5. Press the Algo Trading button so it is green.";
      return 0;
   }
   if(!SymbolSelect(symbol, true))
   {
      error = "Your account has no market called " + symbol + ".";
      return 0;
   }
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   double lot = MathFloor(lots / step + 0.0000001) * step;
   lot = NormalizeDouble(lot, 2);
   if(lot < vmin)
   {
      error = "Lot size " + DoubleToString(lots, 2) + " is below the smallest allowed for " + symbol + " (" + DoubleToString(vmin, 2) + ").";
      return 0;
   }
   if(lot > vmax)
   {
      error = "Lot size " + DoubleToString(lots, 2) + " is above the largest allowed for " + symbol + " (" + DoubleToString(vmax, 2) + ").";
      return 0;
   }
   bool isBuy = (side == "BUY");
   double tickSize = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickLoss = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   double tickProfit = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE_PROFIT);
   if(tickLoss <= 0) tickLoss = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickProfit <= 0) tickProfit = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0 || tickLoss <= 0)
   {
      error = "Could not work out the stop loss distance for " + symbol + ".";
      return 0;
   }
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double minDist = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

   // the stop loss and take profit are amounts of money for this trade: distance = amount / (lots * value per price step)
   double slDist = slAmount / (lot * tickLoss / tickSize);
   double tpDist = (tpAmount > 0 && tickProfit > 0) ? tpAmount / (lot * tickProfit / tickSize) : 0;
   if(slDist < minDist)
   {
      error = "The stop loss is too tight for " + symbol + ". Raise it or lower the lot size.";
      return 0;
   }
   if(tpDist > 0 && tpDist < minDist)
   {
      error = "The take profit is too tight for " + symbol + ". Raise it or lower the lot size.";
      return 0;
   }

   ENUM_ORDER_TYPE otype = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = SymbolInfoDouble(symbol, isBuy ? SYMBOL_ASK : SYMBOL_BID);
   double margin = 0;
   if(OrderCalcMargin(otype, symbol, lot, price, margin))
   {
      if(margin * count > AccountInfoDouble(ACCOUNT_MARGIN_FREE))
      {
         error = "Not enough free margin to open " + IntegerToString(count) + " position(s) of " + DoubleToString(lot, 2) + " lots.";
         return 0;
      }
   }

   gTrade.SetTypeFillingBySymbol(symbol);
   int opened = 0;
   for(int i = 0; i < count; i++)
   {
      if(GetTickCount64() > deadline)
      {
         error = "The order was too old to open.";
         break;
      }
      price = SymbolInfoDouble(symbol, isBuy ? SYMBOL_ASK : SYMBOL_BID);
      double sl = isBuy ? price - slDist : price + slDist;
      double tp = 0;
      if(tpDist > 0) tp = isBuy ? price + tpDist : price - tpDist;
      sl = NormalizeDouble(MathRound(sl / tickSize) * tickSize, digits);
      if(tp > 0) tp = NormalizeDouble(MathRound(tp / tickSize) * tickSize, digits);
      bool ok = gTrade.PositionOpen(symbol, otype, lot, price, sl, tp, orderId);
      uint rc = gTrade.ResultRetcode();
      if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL))
         opened++;
      else
      {
         error = "MT5 refused the trade: " + gTrade.ResultRetcodeDescription();
         break;
      }
   }
   return opened;
}

void AddResult(string id, int opened, string error)
{
   if(gResults != "") gResults += ",";
   gResults += "{\"id\":\"" + JsonEsc(id) + "\",\"opened\":" + IntegerToString(opened) + ",\"error\":\"" + JsonEsc(error) + "\"}";
}


//+------------------------------------------------------------------+
// COPY TRADING. A copy is found again by its comment (the tag): C<master>-<master ticket>.
bool FindTagged(string tag, ulong &ticket)
{
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if((long)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(PositionGetString(POSITION_COMMENT) == tag) { ticket = t; return true; }
   }
   return false;
}

// Open one copy with the follower's lot size and the master's stop loss and take profit (prices). Returns 1 when
// the copy is open (also when it already was, so a repeated order never opens a second one), otherwise 0.
int CopyOpen(string symbol, string side, double lots, double sl, double tp, int ttlSeconds, string tag, string &error)
{
   error = "";
   ulong existing = 0;
   if(FindTagged(tag, existing)) return 1;
   ulong deadline = GetTickCount64() + (ulong)ttlSeconds * 1000;
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))
   {
      error = "Algo trading is switched off in MT5. Press the Algo Trading button so it is green.";
      return 0;
   }
   if(!SymbolSelect(symbol, true))
   {
      error = "Your account has no market called " + symbol + ".";
      return 0;
   }
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   double lot = NormalizeDouble(MathFloor(lots / step + 0.0000001) * step, 2);
   if(lot < vmin)
   {
      error = "Lot size " + DoubleToString(lots, 2) + " is below the smallest allowed for " + symbol + " (" + DoubleToString(vmin, 2) + ").";
      return 0;
   }
   if(lot > vmax)
   {
      error = "Lot size " + DoubleToString(lots, 2) + " is above the largest allowed for " + symbol + " (" + DoubleToString(vmax, 2) + ").";
      return 0;
   }
   bool isBuy = (side == "BUY");
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   double minDist = (double)SymbolInfoInteger(symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;
   ENUM_ORDER_TYPE otype = isBuy ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = SymbolInfoDouble(symbol, isBuy ? SYMBOL_ASK : SYMBOL_BID);
   sl = (sl > 0) ? NormalizeDouble(sl, digits) : 0;
   tp = (tp > 0) ? NormalizeDouble(tp, digits) : 0;
   if(sl > 0 && (isBuy ? price - sl : sl - price) < minDist)
   {
      error = "The master's stop loss is on the wrong side of the price, or too tight, for you right now.";
      return 0;
   }
   if(tp > 0 && (isBuy ? tp - price : price - tp) < minDist)
   {
      error = "The master's take profit is on the wrong side of the price, or too tight, for you right now.";
      return 0;
   }
   double margin = 0;
   if(OrderCalcMargin(otype, symbol, lot, price, margin) && margin > AccountInfoDouble(ACCOUNT_MARGIN_FREE))
   {
      error = "Not enough free margin to open " + DoubleToString(lot, 2) + " lots.";
      return 0;
   }
   if(GetTickCount64() > deadline)
   {
      error = "The copy was too old to open.";
      return 0;
   }
   gTrade.SetTypeFillingBySymbol(symbol);
   bool ok = gTrade.PositionOpen(symbol, otype, lot, price, sl, tp, tag);
   uint rc = gTrade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL)) return 1;
   error = "MT5 refused the trade: " + gTrade.ResultRetcodeDescription();
   return 0;
}

// The master moved the stop loss or take profit: do the same on the copy.
int CopyModify(string tag, double sl, double tp, string &error)
{
   error = "";
   ulong t = 0;
   if(!FindTagged(tag, t)) { error = "The copy is not open any more."; return 1; }
   if(!PositionSelectByTicket(t)) { error = "The copy could not be selected."; return 0; }
   string symbol = PositionGetString(POSITION_SYMBOL);
   int digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(symbol, SYMBOL_POINT);
   sl = (sl > 0) ? NormalizeDouble(sl, digits) : 0;
   tp = (tp > 0) ? NormalizeDouble(tp, digits) : 0;
   if(MathAbs(sl - PositionGetDouble(POSITION_SL)) < point / 2 && MathAbs(tp - PositionGetDouble(POSITION_TP)) < point / 2) return 1;
   bool ok = gTrade.PositionModify(t, sl, tp);
   uint rc = gTrade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_NO_CHANGES)) return 1;
   if(rc == TRADE_RETCODE_NO_CHANGES) return 1;
   error = "MT5 refused the change: " + gTrade.ResultRetcodeDescription();
   return 0;
}

// The master closed the trade: close the copy.
int CopyClose(string tag, string &error)
{
   error = "";
   ulong t = 0;
   if(!FindTagged(tag, t)) { error = "The copy was already closed."; return 1; }
   bool ok = gTrade.PositionClose(t);
   uint rc = gTrade.ResultRetcode();
   if(ok && (rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_PLACED || rc == TRADE_RETCODE_DONE_PARTIAL)) return 1;
   error = "MT5 refused to close the trade: " + gTrade.ResultRetcodeDescription();
   return 0;
}

// One line from the website:
//   ORDER|id|symbol|side|lots|stopLoss|takeProfit|count|ttl      (Bot trading: stop loss and take profit are amounts of money)
//   COPYOPEN|id|symbol|side|lots|slPrice|tpPrice|ttl|tag         (Copy trading: prices)
//   COPYMOD|id|tag|slPrice|tpPrice
//   COPYCLOSE|id|tag
void HandleLine(string line)
{
   if(gMaster) return; // a master only reports
   StringTrimLeft(line);
   StringTrimRight(line);
   if(StringLen(line) == 0) return;
   string p[];
   int n = StringSplit(line, '|', p);
   if(n >= 9 && p[0] == "COPYOPEN")
   {
      string error = "";
      int ok = CopyOpen(p[2], p[3], StringToDouble(p[4]), StringToDouble(p[5]), StringToDouble(p[6]), (int)StringToInteger(p[7]), p[8], error);
      AddResult(p[1], ok, error);
      Print("ABEC-FX copy ", p[8], " ", p[2], " ", p[3], ": ", ok == 1 ? "open" : "not opened", error != "" ? " | " + error : "");
   }
   else if(n >= 5 && p[0] == "COPYMOD")
   {
      string error = "";
      int ok = CopyModify(p[2], StringToDouble(p[3]), StringToDouble(p[4]), error);
      AddResult(p[1], ok, error);
      Print("ABEC-FX copy change ", p[2], ": ", ok == 1 ? "done" : "failed", error != "" ? " | " + error : "");
   }
   else if(n >= 3 && p[0] == "COPYCLOSE")
   {
      string error = "";
      int ok = CopyClose(p[2], error);
      AddResult(p[1], ok, error);
      Print("ABEC-FX copy close ", p[2], ": ", ok == 1 ? "done" : "failed", error != "" ? " | " + error : "");
   }
   else if(n >= 9 && p[0] == "ORDER")
   {
      string error = "";
      int opened = RunOrder(p[2], p[3], StringToDouble(p[4]), StringToDouble(p[5]), StringToDouble(p[6]), (int)StringToInteger(p[7]), (int)StringToInteger(p[8]), p[1], error);
      AddResult(p[1], opened, error);
      Print("ABEC-FX order ", p[1], " ", p[2], " ", p[3], ": opened ", opened, error != "" ? " | " + error : "");
   }
}

//+------------------------------------------------------------------+
void OnTimer()
{
   if(gBadKey)
   {
      ShowStatus("Your key is no longer valid. Press Link account in the portal, then update the key here.");
      return;
   }
   string json = BuildReport();
   char post[], result[];
   int len = StringToCharArray(json, post, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(post, len - 1); // drop the end-of-text character
   string headers = "Content-Type: application/json\r\nX-Bot-Key: " + InpBotKey + "\r\n";
   string responseHeaders = "";
   ResetLastError();
   int code = WebRequest("POST", InpServerUrl + "/api/bot/report", headers, 10000, post, result, responseHeaders);
   if(code == -1)
   {
      int err = GetLastError();
      ShowStatus("Cannot reach the website (error " + IntegerToString(err) + "). Allow WebRequest for " + InpServerUrl + " in Tools > Options > Expert Advisors.");
      return;
   }
   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code == 401)
   {
      gBadKey = true;
      ShowStatus("Your key is no longer valid. Press Link account in the portal, then update the key here.");
      return;
   }
   if(code != 200)
   {
      string msg = body;
      if(StringFind(msg, "ERR|") == 0) msg = StringSubstr(msg, 4);
      ShowStatus("The website answered " + IntegerToString(code) + ": " + msg);
      return;
   }
   // the report arrived: results and old trades need not be sent again
   gResults = "";
   gLastSync = TimeCurrent();
   GlobalVariableSet(SyncKey(), (double)(long)gLastSync);
   string lines[];
   int count = StringSplit(body, '\n', lines);
   for(int i = 1; i < count; i++) HandleLine(lines[i]);
   ShowStatus((gMaster ? "Master mode: reporting your trades. " : "Connected. ") + "Last report " + TimeToString(TimeLocal(), TIME_SECONDS) + ".");
}
//+------------------------------------------------------------------+
