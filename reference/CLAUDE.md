# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this project is

A single-page tool that lets University of Michigan Family Medicine residency
staff track mileage for reimbursement and print a two-page PDF form to submit.
The app is three plain files — [mileage-log.html](mileage-log.html) (markup),
[styles.css](styles.css) (all CSS), [app.js](app.js) (all JS) — with no build
step, no package manager, no framework, and no server. It's opened directly
in a browser. [README.md](README.md) is the end-user instructions page
(linked from the app's footer).

## How to work on this project

- **This is a small, hand-tuned app. Work incrementally.** Make one focused
  change at a time, then stop and let the user look at it (ideally in a
  browser) before moving to the next change. Do not bundle several unrelated
  changes into one edit.
- **Ask before large refactors.** Things like introducing a build tool or
  framework, splitting `app.js` into modules, renaming the storage schema, or
  restructuring the grid/state model are all large refactors — propose the
  idea and get explicit go-ahead before doing it. Default to editing in place
  within the existing three-file structure.
- **Visual/print layout is a first-class concern, not a detail.** The entire
  point of this app is a clean printable PDF. The form is designed to fit
  exactly on **two US Letter pages** (`@page { size: letter; margin: 0.45in }`
  in the `@media print` block) — page 1 is the header/preamble/31-day grid,
  page 2 is the summary/signature/footer. Any change to fonts, font sizes,
  padding, row heights, or added content is a layout risk: it can push page 2
  onto a third page or make page 1 overflow. After any visual change, mentally
  (or actually, via the `run` skill / browser print preview) check that both
  pages still fit.
  - `styles.css` effectively contains two parallel stylesheets: the
    on-screen styles and the `@media print` overrides near the bottom. A
    change to spacing/sizing often needs a matching adjustment in both
    places — the screen version and the denser print version are not the
    same rules.
  - Print styles intentionally avoid large dark/colorful fills (grayscale
    printer friendliness) and hide unchecked checkboxes and empty-field
    placeholders so a partially-filled form still prints clean.
- **Don't add a backend or external dependencies** without asking. The only
  external resource currently loaded is the Google Fonts stylesheet
  (`Source Serif 4` / `Source Sans 3`); everything else — storage, signature
  capture, PDF generation — is deliberately done with plain browser APIs
  (`localStorage`, `sessionStorage`, `<canvas>`, `window.print()`) so the app
  works fully offline with no install step. Keep it that way unless asked.
- Keep edits framework-free vanilla HTML/CSS/JS consistent with the existing
  style (plain DOM APIs, no build tooling, no TypeScript).

## Architecture

Three files:

- `mileage-log.html` — markup only: two `.page` divs (`#page1`, `#page2`)
  that map 1:1 to the two printed pages, plus a `<link rel="stylesheet"
  href="styles.css">` in `<head>` and a `<script src="app.js"></script>` at
  the end of `<body>`.
- `styles.css` — screen styles, then a `@media print` block with the
  two-page print overrides described above.
- `app.js` — all app logic, no modules, top-to-bottom execution ending in an
  init block near the bottom (`loadState()` → `buildRows()` →
  `updateP2Subtitle()` → `updateUndoRedo()`). It relies on running after the
  static markup has parsed (loaded un-deferred, at the end of `<body>`), so
  keep it there rather than moving it to `<head>`.

### State model

- `grid[day][trip]` — a plain object, `day` 1–31, `trip` 1–9, boolean. This is
  the single source of truth for the mileage checkboxes; only one trip per
  day may be true (enforced in `onTripChange`).
- `TRIPS` — array of 9 fixed trip definitions (`miles`, `label`, `short`),
  hardcoded to specific UMHS satellite clinic routes. `RATE` is the flat
  per-mile IRS reimbursement rate (currently `0.725`), also hardcoded.
- Everything else (name, employee ID, address, rotation, month, date,
  signature) lives directly in form field DOM values, read/written on demand.

### Persistence — three separate stores, don't conflate them

1. **`localStorage['mileage_log_v3']`** — auto-save of the current form
   (fields + grid + signature). Restored on load via `loadState()`. Bumping
   this key's version suffix would silently drop existing users' saved data,
   so treat that as a breaking change.
2. **`sessionStorage['mileage_log_undo'/'mileage_log_redo']`** — undo/redo
   history as a stack of full-state snapshots (`currentSnapshot()` /
   `applySnapshot()`), capped at `UNDO_LIMIT = 20`. Cleared when the tab
   closes; a new action always clears the redo stack.
3. **Exported `.json` file** (`exportJSON()` / `importJSON()`) — a portable
   copy of the same shape as the localStorage record, for backup/transfer
   between machines. Import validates the file has at least one recognizable
   field and shows a confirmation summary of what will be overwritten before
   applying it.

### Key functions (by area)

**Grid / trips**
- `buildRows()` — generates the 31 table rows (day cell, auto indicator
  checkbox, 9 trip checkboxes) into `#grid-body-1`.
- `onTripChange(day, trip, checked)` — enforces single-trip-per-day, updates
  `grid`, pushes undo, refreshes indicator + summary + save.
- `updateIndicator(day)` / `updateAllIndicators()` — sync the read-only "any
  trip checked" indicator column.
- `getTotals()` — per-trip counts across all days.
- `updateSummary()` — rebuilds the page-2 summary rows and grand total from
  `getTotals()`, `TRIPS`, and `RATE`.
- `clearGrid()` — confirms, then zeroes just the grid (keeps fields/signature).
- `newForm()` — confirms, then wipes localStorage and resets everything
  (fields, grid, signature, month).

**Persistence**
- `saveState()` / `loadState()` — localStorage auto-save/restore.
- `currentSnapshot()` / `applySnapshot()` / `pushUndo()` / `undo()` / `redo()`
  / `updateUndoRedo()` / `pushUndoDebounced()` — sessionStorage undo/redo
  stack. Text-field edits push a debounced (500ms) snapshot; checkbox/discrete
  changes push immediately.
- `exportJSON()` / `importJSON(input)` — file-based backup/restore, plus a
  page-level `dragover`/`drop` listener so a `.json` file can be dropped
  anywhere on the page to trigger import.

**Signature**
- `setSigMode('upload'|'draw')` — toggles between the two signature capture
  UIs.
- Upload path: `#sig-file-input` change handler downsamples the chosen image
  onto a small canvas (max 280×38 display px, 3x scale) and stores it as a
  PNG data URL via `applySignature()`.
- Draw path: `initCanvas()` wires mouse/touch drawing on `#sig-canvas`
  (retina-scaled 2x); `saveDrawnSignature()` captures it as a data URL and
  flips back to the "upload" view to display the result; `clearCanvas()`
  wipes the canvas.
- `applySignature(dataUrl)` / `clearSignature(e)` — show/hide the signature
  image vs. the placeholder text; signature data URLs are what gets persisted
  in localStorage/sessionStorage/export.

**Misc UI**
- Month checkboxes are single-select (checking one unchecks the others),
  wired inline near the bottom of the script.
- `updateP2Subtitle()` — keeps the page-2 header subtitle in sync with
  name + selected month.
- `todayStr` / the "Today" button — fills the date field with today's date.

## Things to be careful about when changing code

- The 9 trip routes and their mileages in `TRIPS` (and the matching text in
  the `.trip-ref` HTML block and table header cells) are program-specific
  data, not placeholders — don't "clean up" or reorder them without asking;
  the order must match `grid[d][t]` indices and the printed reference key.
- `RATE` is the current IRS mileage rate. It changes periodically (real-world
  IRS updates) — treat requests to update it as a simple, deliberate one-line
  change, not something to touch incidentally.
- IDs like `r{day}_t{trip}` and `r{day}_ind` are relied on by both build and
  update logic — keep the naming scheme if you touch `buildRows()`.
- There's no test suite. The only verification available is opening the file
  in a browser (see the `run` skill) and checking behavior + print preview
  visually.
