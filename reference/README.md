# FM Mileage Reimbursement Log

A single-page web tool for tracking and printing mileage reimbursement for the University of Michigan Family Medicine Residency Program.

**[Open the Mileage Log](mileage-log.html)**

---

## How to Use

1. Open `mileage-log.html` in your browser — no installation or internet connection required.
2. Fill in your name, employee ID, address, rotation, and month in the header fields.
3. For each day you traveled, check the box in the corresponding trip column.
4. Add your signature by uploading an image or drawing directly in the browser.
5. Set the date field (or click **Today** to fill it automatically).
6. Click **Print / Save PDF** to generate a printable two-page reimbursement form.

---

## Filling in the Grid

Each row represents a calendar day (1–31). Check the trip type for that day — only one trip per day is allowed. The **✓** column is filled automatically when any trip is selected for that day.

The summary on the second printed page calculates the total reimbursement based on the current IRS rate.

---

## Saving & Restoring Data

### Auto-save
Your entries are automatically saved to your browser's local storage as you work. If you close and reopen the page in the same browser on the same computer, your data will be restored.

### Export Data
Click **Export Data** (below the main buttons) to download your current form as a `.json` file. This file captures all fields, the mileage grid, and your signature. Use this to:
- Back up a completed month before starting a new one
- Transfer your data to a different computer or browser

### Import Data
Click **Import Data** to load a previously exported `.json` file. You can also **drag and drop** a `.json` file anywhere onto the page to trigger the import.

Before any data is applied, you will see a confirmation prompt summarizing exactly what will be overwritten. The import will be rejected if the file is not a valid mileage log export.

---

## Buttons

| Button | What it does |
|---|---|
| **Reset Trips** | Clears all checkboxes in the mileage grid. Fields and signature are kept. |
| **Clear All Data** | Resets the entire form — all fields, checkboxes, and signature. |
| **Undo** | Steps back through recent changes. Survives within a browser session. |
| **Redo** | Re-applies a change that was undone. Cleared when new changes are made. |
| **Print / Save PDF** | Opens the browser print dialog. Choose "Save as PDF" to save a file. |
| **Export Data** | Downloads form data as a `.json` file. |
| **Import Data** | Loads form data from a `.json` file. |

---

## Signature

You can attach a signature in two ways:
- **Upload** — click the signature area to select an image file from your computer.
- **Draw** — switch to Draw mode and sign with your mouse or a touchscreen.

To remove a signature, click the **✕** button in the signature area.

---

## Data & Privacy

- All data is saved in your **browser's local storage** — no account or login required.
- Undo/redo history is stored in **session storage** and is cleared when the browser tab is closed.
- **Nothing is sent to a server.** No information leaves your browser.

---

*Most Recent Update: 2026-03-25*
