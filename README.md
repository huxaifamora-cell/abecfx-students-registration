# ABECFX Student Registration

Registration platform for **ABECFX (Adebass Base Edge Consult - forex)**.
Every student gets a unique registration number like `ABECFX/26/0001`
(`26` = year of admission, `0001` = student number, counted per year).
All registrations are saved in a Google Sheet.

> Note: Google **Docs** can't act as a database, so the app uses **Google Sheets**
> (same Google account, same Drive). Each registration becomes one row.

> **Project status:** `PROJECT-STATUS.md` holds the goals, decisions, current state, next steps, change log and the latest code. It is updated with every code change. Rebuild it with `node status/build.js`.

## 1. Create the Google Sheet (database)

1. Go to https://sheets.google.com and create a blank sheet named **ABECFX Students**.
2. Copy the sheet ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

The app creates the `Students` tab and header row automatically on first start.

## 2. Create a service account (lets the app write to the sheet)

1. Open https://console.cloud.google.com and create a project (e.g. `abecfx`).
2. **APIs & Services > Library** > search **Google Sheets API** > **Enable**.
3. **APIs & Services > Credentials > Create credentials > Service account**. Give it any name, finish.
4. Open the service account > **Keys > Add key > Create new key > JSON**. A `.json` file downloads.
5. Open that JSON, copy the `client_email` value, then go back to your Google Sheet >
   **Share** > paste that email > give it **Editor** access.

## 3. Put the code on GitHub

Create a new **private** GitHub repo and push this folder to it
(the `.gitignore` already keeps secrets and `node_modules` out).

## 4. Deploy on Render

1. https://dashboard.render.com > **New > Blueprint** (or **New > Web Service**) and pick your repo.
   - Blueprint: Render reads `render.yaml` automatically.
   - Web Service: Runtime `Node`, Build `npm install`, Start `npm start`.
2. Add these **Environment variables**:
   - `GOOGLE_SHEET_ID` = the sheet ID from step 1
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = the **entire contents** of the downloaded JSON key file
3. Deploy. Your form is live at `https://<your-service>.onrender.com`.
4. (Optional) **Settings > Custom Domains** to use your own domain, e.g. `register.yourdomain.com`.

On Render's free plan the service sleeps after ~15 minutes idle, so the first visit
after a quiet spell can take about 30 seconds. See "Keeping the service awake" below.

### Keeping the service awake

1. **Built in:** while running, the app requests its own `/healthz` page every 10 minutes
   (it uses the `RENDER_EXTERNAL_URL` that Render sets itself). Set `KEEP_AWAKE=off` to disable.
2. **Outside pinger (needed too):** the built-in ping cannot wake a service that is already asleep
   (for example after a deploy or restart). Make a free account on https://uptimerobot.com (or
   https://cron-job.org), add an **HTTP(s) monitor** for `https://<your-service>.onrender.com/healthz`
   with a **5 minute** interval. That keeps it awake and also alerts you if the site goes down.
3. **Paid instance:** Render's paid plan never sleeps and is the dependable fix if students depend on it.

## Run locally (optional)

```bash
cp .env.example .env   # fill in values, then:
npm install
export $(grep -v '^#' .env | xargs) && npm start
```

## How it works

- `POST /api/register` validates the form, rejects duplicate emails, generates the next
  registration number for the current year (Lagos time), and appends a row to the sheet.
- Registrations are processed one at a time, so two students can never receive the same number.
- Spam protection: rate limit (20 attempts / 15 min per IP) plus a hidden honeypot field.

## Sheet tabs and columns

**Students** tab: Reg Number, Registered At (Lagos), Country, Programme Type, Full Name, Email,
WhatsApp Number, Gender, Promo Code, **Status**, **Status Date**, **ID Issue Date**, **State / Region**.

**Quiz Results** tab: one row per finished quiz, written by the Telegram quiz bot (reg number, name, score, total, percent, grade, attempt). Don't edit it by hand.

**Photos** tab: each student's passport photo (shrunk to a small JPEG and stored as text).
The app manages this tab. Don't edit or sort it. Passport photos are required at registration.

## Pages

| Address | What it is |
| --- | --- |
| `/` | **Student portal.** A student who registered on this device lands straight on their ID card. Anyone else enters their registration number to open it, or taps Register. |
| `/register` | The registration form. **Share this link when you want new students to sign up.** |
| `/status` | Find any student's ID card by registration number. The QR code on every card points here. |
| `/admin` | **Editor dashboard** (password protected): student statistics and quiz results. Not linked from the public pages; bookmark it. |

Every page has a navigation bar: down the left side on computers, along the bottom on phones.
After registering, the student's number is remembered on their device, so the next visit to `/`
opens their portal. The register page also tells a returning student they are already registered.

## Student ID card page

Anyone can open `/status` (e.g. `https://<your-service>.onrender.com/status`), type a registration
number and see that student's **ID card**:

- passport photo and **national flag** of their country
- full name, registration number, gender, country, state / region, programme, year admitted
- status, and the date they got it (once they are no longer Uncertified)
- a **QR code**. Scanning it opens `/status?reg=...`, which looks the student up straight away and
  shows the live card
- a round **stamp**: "Certified Graduate - ABEC-FX" for Certified and Graduate students, "Alumni Member" for Alumni
- Print ID card and Copy link buttons (Print can also save as PDF)

Email, WhatsApp number and promo code are never shown publicly.

New students also see their ID card right after registering.

### Setting a student's status

**Status** is column J of the Students tab. Every new student is saved as **Uncertified**. An editor
picks a new value from the dropdown:
`Uncertified`, `Certified`, `Graduate`, `Alumni Member`, `Mentor`, `Staff Member`, `CEO`.
Then type the date in the **Status Date** column (K), e.g. `13 Oct 2026`.
The stamp shows that date too. Changes show on the ID card within about 15 seconds.

### ID expiry

Certified students are graduates. IDs of students who are **not yet graduates** (status Uncertified)
are valid for **2 months from the ID Issue Date**. The card shows "Expires 13 Dec 2026", warns in the
last 14 days, and shows a red **EXPIRED** mark after the expiry date. Certified, Graduate, Alumni Member,
Mentor, Staff Member and CEO IDs have no expiry. When an editor changes a student to Certified (or
Graduate), the expiry disappears and the graduate stamp appears.

The **ID Issue Date** (column L, written as `2026-10-13`) is set automatically at registration. To
**renew** an expired ID, an editor types a new date in that cell. Students registered before this
update have no date in column L, so the date in "Registered At" is used instead.

### State / region

After choosing a country, the student picks their state, province or region from a list
(`states.json`, built from the ISO 3166-2 standard, 195 countries). Kosovo and Vatican City have no list,
so a text box is shown. Students registered before this update have an empty State / Region cell;
an editor can type it in column M and it will show on their card.

## Quiz results and the editor dashboard

### How the quiz connects

The quiz is the separate Telegram bot (its own repo and Render service). The student opens it,
enters their registration number, and the bot fetches their name from this website. When they finish
a full quiz, the bot sends the result here. The website works out the grade, saves it in the
**Quiz Results** tab, and shows it in the student's portal (`/`) under their ID card.

Set these on the **registration website** (Render > Environment):

| Variable | What to put |
| --- | --- |
| `QUIZ_API_KEY` | A long random secret you invent (30+ random characters). Use the **same** value on the quiz bot. |
| `ADMIN_PASSWORD` | The password for `/admin`. |
| `QUIZ_BOT_URL` | The bot's link, e.g. `https://t.me/YourQuizBot`. Shows a "Take the quiz on Telegram" button in the portal. |

The quiz bot needs `BOT_TOKEN`, `REG_SITE_URL` (this website's address) and the same `QUIZ_API_KEY`.
See the quiz bot's README.

Rules built in: only a finished quiz is saved (practice runs and "end quiz" early are not); the first
Telegram account to take the quiz for a registration number keeps it, so nobody can post results under
someone else's number (to move a number to a new Telegram account, clear the **Telegram ID** cells for it in
the Quiz Results tab); double submits are ignored.

### One-time quiz codes

The quiz is locked until a student enters a one-time code (like `QZ-7K4M-9PXR`).

- **Who makes codes:** the owner, any Admin, and any role that has the **Quiz codes** access. To put someone
  else in charge, open **Team**, click **Create role**, tick only **Quiz codes**, and add them with that role.
  Editors and Moderators cannot make codes unless you give them such a role.
- **Making codes:** `/admin` > **Quiz codes**. Choose how many (1 to 50). Optionally type a registration number to
  make the code usable by that student only. Copy the codes and give them out.
- **What a student sees:** in the portal's **Quiz** page there is an **Unlock the quiz** box. A correct code opens
  the quiz (and the Telegram link). It stays open, on any device, until the quiz is finished.
- **After the quiz:** once the result is saved the code is spent and the quiz locks again. The next attempt needs
  a new code. A used code cannot be reused by anyone.
- **Cancelling:** on the same tab, **Cancel** stops a code. If its student is in the middle of the quiz, their quiz
  locks at once and an unfinished quiz is not saved.
- Codes live on the **Quiz Codes** sheet tab (Status: Unused, Unlocked, Completed, Revoked). They are not part of the
  dashboard's Database tab on purpose, so only the Quiz codes access can make them.
- **Telegram:** the bot is a separate project. The portal only shows its link while the quiz is unlocked, but the bot
  itself is not locked unless you set `QUIZ_CODE_FOR_TELEGRAM=on` (see `env.example`). Turn that on only after
  checking that the bot shows the website's error message when the website answers 403.

### Community page

Students see a **Community** item in their portal menu with buttons for WhatsApp and Telegram. Set the groups in
`/admin` > **Site links** (*Student community: WhatsApp* and *Telegram*). Leave one empty and the page uses the
official WhatsApp or Telegram link on the same tab. These two links are only given to signed-in students, never
on the public pages.

### Grading (A to F)

| Grade | Score | Meaning |
| --- | --- | --- |
| A | 70 - 100% | Excellent |
| B | 60 - 69% | Very good |
| C | 50 - 59% | Good |
| D | 45 - 49% | Fair |
| E | 40 - 44% | Pass |
| F | 0 - 39% | Fail |

To change the boundaries edit `grading.js`; the portal, dashboard and bot all follow.

### Editor dashboard (`/admin`)

Sign in with a username and password. The **owner** signs in as `owner` with `ADMIN_PASSWORD` (it always works and cannot be removed). The owner and any **Admin** can add more people on the **Team** tab (accounts are kept on a `Team` sheet tab, passwords stored only as salted hashes): an **Admin** sees everything, changes the site (links, videos, database) and manages the team; a **Moderator** can only view statistics, student lists and quiz results. A role change or a disable takes effect on the very next click; to cut someone off at once, disable or remove them. Nobody can demote, disable or remove their own account, and team members can change their own password from the top bar. **Statistics** tab: total students, certified/graduates (Certified, Graduate and
Alumni Member), uncertified, mentors/staff/CEO, gender, country, state, programme, year joined, month joined
(pick a year), monthly growth (new students, running total, change vs last month). **Quiz results** tab:
grade spread, every result with search, grade filter, latest/best per student, and a CSV download.
No emails or phone numbers appear on the dashboard. If `ADMIN_PASSWORD` is not set the dashboard stays off.

### Updating an existing deployment

Redeploy. On startup the app adds the new columns, the Photos tab and the new dropdown values.
Students registered before this update have no photo, so their card shows their initials instead.
Old rows with a blank Status count as Uncertified.

### Notes on privacy and flags

- Flags load from flagcdn.com. If a flag can't load, the card falls back to an emoji flag.
- Registration numbers run in order, so someone could try numbers one after another and view
  names and photos. Lookups are rate limited (30 searches and 20 photo views per 10 minutes per
  visitor), which slows this down but does not stop it.
