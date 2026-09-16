# FM Mileage Reimbursement Log

A single-page web tool for tracking and printing mileage reimbursement for the University of Michigan Family Medicine Residency Program.

**[Open the Mileage Log](mileage-log.html)** · **[View source on GitHub](https://github.com/benroot/fm-mileage-log-v2)**

---

## How to Use

1. Open `mileage-log.html` in your browser, or visit the hosted GitHub Pages link.
2. Fill in your name, employee ID, address, rotation, and month/year in the header fields.
3. For each day you traveled, pick the trip from that day's dropdown — pick **No Trip** (the default) for days you didn't travel.
4. Add your signature by uploading an image or drawing directly in the browser.
5. Set the date field.
6. Click **Print / Save PDF** to generate a printable one-page reimbursement form.

---

## Filling in Your Trips

Each row is one calendar day. Pick the trip type from that day's dropdown — the mileage shown next to each option is just a sanity check that you picked the right one, not something you need to track yourself.

The printed form only lists days that actually have a trip selected, numbered in order. The summary section totals the miles for each trip type, then converts the grand total to a dollar amount using the current mileage rate — the rate is shown once, in that final calculation, since only one rate is ever in effect for a given month's form.

---

## Saving Your Data

Your entries are automatically saved to your browser's local storage as you work — no account, login, or "Save" button needed. If you close and reopen the page in the **same browser, on the same computer**, your data will be restored.

There is no export/import or cross-device backup in this version — if you switch computers, clear your browser data, or use a different browser mid-month, that month's entries are not recoverable from elsewhere. Keep that in mind if you're close to finishing a month's log.

Your name, employee ID, address, rotation, and signature are saved separately from your trip entries and persist indefinitely (there's no "clear profile" button — only trips can be cleared). Changing the Month/Year fields does **not** clear your trip entries; use **Clear Trips** when you're ready to start a new month.

---

## Buttons

| Button | What it does |
|---|---|
| **Clear Trips** | Clears all selected trips for the current list. Profile fields and signature are kept. |
| **Print / Save PDF** | Opens the browser print dialog. Choose "Save as PDF" to save a file. |

---

## Signature

You can attach a signature in two ways:
- **Upload** — click **Choose signature image…** to select an image file from your computer.
- **Draw** — switch to Draw mode and sign with your mouse or a touchscreen (a keyboard/screen-reader accessible alternative is not available for drawing — use Upload instead).

There's no separate "remove signature" button. To replace a signature, upload a new image or draw a new one — either overwrites whatever was there before.

---

## For Admins: Updating Trip Types & Rates

Trip types (labels + mileage) and mileage reimbursement rates are **not hardcoded** — they're maintained in a Google Sheet, published to the web as CSV, and fetched automatically when the page loads.

- **Trips tab** — one row per trip type, with a header row and columns for the label and the mileage.
- **Rates tab** — one row per rate change, with a header row and columns for the effective start date and the rate. The rate that applies to a given month is whichever row has the latest start date on or before the 1st of that month — so to change the rate going forward, add a new row rather than editing the old one.
- After editing either tab, make sure **File → Share → Publish to web** still has **"Automatically republish when changes are made"** checked — if that gets unchecked, your edits won't show up in the app until you republish manually.
- The two published-CSV URLs the app fetches are stored in [`config.json`](config.json) at the root of this repo — that's the file to update if the Sheet is ever recreated or its published link changes.
- If the app can't reach the Sheet when the page loads, it falls back to the last successfully fetched copy (cached in your browser) and says so on screen; if there's no cached copy either, no trip types or rate will be available and the app says that too, rather than showing stale or fake data.
- One thing to know before editing an existing row: each trip is identified by its label + mileage together, not a separate ID. Editing an existing trip's label or mileage (rather than adding a new row) means anyone with that trip already selected in an in-progress form will see it flagged as "previous selection no longer available" the next time they load the page, and will need to re-pick it. This is expected — the trade-off was made deliberately since trip/rate edits happen rarely — but it's worth knowing before you fix a typo mid-month.

---

## Data & Privacy

- Your form data is saved in your **browser's local storage** — no account or login required.
- On page load, the app fetches the current trip types and mileage rate from a published Google Sheet CSV. This is the only network request the app makes — no form data (your name, trips, signature, etc.) is ever sent anywhere.

---

*Most Recent Update: 2026-09-15*
