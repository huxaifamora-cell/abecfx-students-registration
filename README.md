# ABECFX Student Registration

Registration platform for **ABECFX (Adebass Base Edge Consult - forex)**.
Every student gets a unique registration number like `ABECFX/26/0001`
(`26` = year of admission, `0001` = student number, counted per year).
All registrations are saved in a Google Sheet.

> Note: Google **Docs** can't act as a database, so the app uses **Google Sheets**
> (same Google account, same Drive). Each registration becomes one row.

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
after a quiet spell can take about 30 seconds. A paid instance removes this.

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

## Sheet columns

Reg Number, Registered At (Lagos), Country, Programme Type, Full Name, Email, WhatsApp Number, Gender, Promo Code, **Status**, **Status Date**

## Student status page

Anyone can open `/status` (e.g. `https://<your-service>.onrender.com/status`), type a registration
number and see that student's **name, gender, status and status date**. Email, WhatsApp number,
country and promo code are never shown publicly.

**Status** is column J of the sheet. Every new student is saved as **Uncertified**. To change it,
an editor opens the sheet and picks a new value from the dropdown:
`Uncertified`, `Certified`, `Mentor`, `Staff Member`, `CEO`.
Then type the date in the **Status Date** column (K), e.g. `13 Oct 2026`.
The date is only shown on the status page when the status is not Uncertified.

Changes show on the status page within about 15 seconds.

Already deployed an earlier version? Just redeploy: on startup the app adds the two new columns
and the dropdown. Old rows with a blank Status are treated as Uncertified.
