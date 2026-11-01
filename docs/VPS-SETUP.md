# Running the master accounts on a central VPS

This guide is for the owner (or whoever looks after the server). It puts every **master's** MetaTrader 5 on one
Windows VPS so that copy trading does not depend on a mentor's laptop staying on. Followers' copies only open, change or
close while the master's connector is reporting, so the master's uptime is the uptime of the whole feature.

It covers masters only. Members' own accounts stay on the members' own MT5 (their own PC or their own VPS). Hosting
members' accounts on this VPS is a different matter, because it means holding access to their money. See
"Hosting members' accounts" at the end before doing that.

> This guide was written without access to a VPS or to MT5, so it has not been run end to end. Do the first master on a
> **demo** account and follow it step by step before using a real one.

## 1. What to rent

- A **Windows Server** VPS (2 vCPU and 4 GB RAM is enough for a few masters; MT5 uses roughly 300 to 500 MB each).
- A data centre close to your broker's servers if the provider lets you choose.
- Remote Desktop (RDP) access.

## 2. Prepare Windows once

1. Set a long, unique Administrator password. Turn on Network Level Authentication for Remote Desktop.
2. If the provider has a firewall, allow RDP only from your own IP address.
3. Power settings: never sleep, never turn the disk off.
4. Windows Update: set active hours so it does not restart in trading hours.
5. Install the broker's MT5 once (download it from your broker's own site) to `C:\MT5\template`. Do not log in yet.

## 3. One folder per master (portable mode)

Repeat for each master; use a clear folder name such as `C:\MT5\ade`.

1. Copy `C:\MT5\template` to `C:\MT5\ade`.
2. Start the copy with `"C:\MT5\ade\terminal64.exe" /portable`. The `/portable` switch keeps everything of this
   terminal inside its own folder, so masters never share settings or files.
3. Log in to the master's trading account (File > Login to Trade Account). Tick **Save account information**.
4. In the website, open **Copy trading** as the master, press **Link account**, copy the key (it starts with `MK-`), and
   press **Download connector**.
5. In MT5: File > Open Data Folder > `MQL5` > `Experts`. Put `ABECFX_Bot_Connector.mq5` there. Open it in MetaEditor and
   compile (F7). Refresh the Navigator.
6. Tools > Options > Expert Advisors: tick **Allow WebRequest for listed URL** and add your website's address (the one
   shown on the Copy trading page).
7. Drag **ABECFX_Bot_Connector** onto any chart. On the Inputs tab paste the key into **InpBotKey**. Keep "Allow
   Algo Trading" ticked on the Common tab.
8. The chart's top-left status line should say `Master mode: reporting your trades.` With an `MK-` key the connector only
   reports; it never opens, changes or closes a trade.
9. Save the profile (File > Profiles > Save As) so the chart and connector come back after a restart.

## 4. Start by itself after a reboot

1. Set Windows to sign in automatically for the account that runs the terminals (Sysinternals Autologon is the usual way;
   it stores the password in Windows, so keep the VPS locked down).
2. For each master, make a shortcut to `"C:\MT5\ade\terminal64.exe" /portable` and put it in
   `shell:startup` (or create a Task Scheduler task that runs at log on).
3. Restart the VPS once on purpose and check that every master shows **Online** on the Copy trading page within a minute.

## 5. Tell the website the master is hosted

In the Google Sheet, open the tab **Copy Masters**, find the master's row and set **Hosted On ABEC-FX VPS (Yes/No)** to
`Yes`. Followers then see "(ABEC-FX VPS)" next to that master's status. Masters cannot set this themselves.
To block a master, set **Active (No blocks this master)** to `No`.

## 6. Keeping it healthy

- Check the Copy trading page: a master that shows Offline is not reporting, and nothing is copied or closed meanwhile.
- If the key is made again in the portal, the old key stops working; paste the new key into **InpBotKey**.
- The connector's own messages are on the chart and in MT5's Experts tab (for example "Cannot reach the website": the
  WebRequest address is missing or the site is down).
- Update MT5 when the broker asks, then check the connector is still on the chart.
- Back up each `C:\MT5\<name>` folder after setup, and keep the RDP address and password out of chats and screenshots.

## Hosting members' accounts (built, switched off until you decide)

Running a member's MT5 on this VPS needs their account number and **trading password**. That makes you the holder of
access to their money. Before turning it on:

- Check the broker's terms allow a third party to operate an account this way.
- Ask a lawyer whether charging for it needs a licence where you operate and where the member lives.
- Decide how members pay and how a dispute is handled. The website does not take payments.

How the website handles it (`VPS_HOSTING=on` turns it on):

1. An Alumni member opens **Copy trading > Run your connector on the ABEC-FX VPS**, gives their MT5 account number, broker
   server and account type, and ticks a consent box. No password is asked for, and none is stored.
2. In the dashboard, **VPS hosting** (needs the new "VPS hosting" access, which the Owner and Admin roles have) lists the
   requests. Set a request to **Approved**, then contact the member yourself.
3. The member gives their trading password to you **privately and only for typing into their terminal on the VPS**.
   Never in the website, the Google Sheet or a group chat.
4. Set up their terminal exactly as in section 3 (one portable folder each, for example `C:\MT5\member-0002`), log in
   with their account, and on the request press **Make connector key**. Paste that key into **InpBotKey** of that terminal
   only. The key replaces the member's own key, so the member's own connector stops.
5. Mark the request **Active** and write the folder in **VPS slot**. The member's page then shows that they are hosted.
6. When the member ends hosting (or you do), stop that terminal, delete its folder, and ask the member to change their
   trading password in MT5.

Run each member's terminal on its own folder, and plan for the machine's size: a few hundred MB of memory per terminal.
