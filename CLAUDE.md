# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this project is

A single-page tool that lets University of Michigan Family Medicine
residency staff track mileage for reimbursement and print a two-page PDF
form to submit. This is **v2** of an earlier hand-built version — the core
purpose is unchanged, but the data model and entry UI are substantially
redesigned to let a non-engineer admin update trip types and mileage rates
without touching code.

The app is still static files served from GitHub Pages: no server, no
per-request backend logic. The one deliberate change from v1 is that it is
**no longer offline-only** — it makes a small number of network calls on
page load to fetch admin-editable config. Everything else about it (no
build step, opened directly by a URL, printable two-page output) should be
treated the same way v1 treated those constraints: real, load-bearing
design decisions, not incidental.

## Reference: the v1 codebase

The previous version of this app lives locally at `reference/fm-mileage-log-v1/`
(copied/cloned in, not fetched over the network — do not assume network
access to the original GitHub repo). Read it before making changes here;
it's the working example of the print-layout, persistence, and undo/redo
patterns this project is extending, not just historical context.

- `reference/fm-mileage-log-v1/app.js` — v1's app logic: the grid/checkbox
  model being replaced by the `trips` list model below, plus the
  undo/redo, autosave, and signature-capture logic being carried forward
  largely as-is.
- `reference/fm-mileage-log-v1/mileage-log.html` — v1's markup, showing the
  two-page `.page` div structure this project keeps.
- `reference/fm-mileage-log-v1/styles.css` — v1's screen + `@media print`
  styles; the two-page print-fit approach carries forward, the visual
  design (fonts, tokens) does not — see CSS section below.
- `reference/fm-mileage-log-v1/CLAUDE.md` — the v1 project's own guidance
  file; useful for understanding *why* v1 was built the way it was, even
  where v2 deliberately diverges from it.

## How to work on this project

- **This is a small, hand-tuned app. Work incrementally.** Make one focused
  change at a time, then stop and let the user look at it (ideally in a
  browser) before moving to the next change. Do not bundle several
  unrelated changes into one edit.
- **Ask before large refactors** not already agreed to below.
- **Visual/print layout is a first-class concern, not a detail.** The whole
  point of this app is a clean printable PDF, fit to **two US Letter
  pages** (`@page { size: letter; margin: 0.45in }` in `@media print`). Any
  layout change is a risk to that fit — always check print preview after
  touching layout, spacing, or content volume.
- **No CDN dependencies, no exceptions.** Alpine.js is vendored (committed)
  into the repo, e.g. `vendor/alpine.min.js`, not loaded from an external
  `<script src>`. Unlike v1, this project does **not** load Google Fonts —
  see CSS section below. The **only** external network calls this app
  should ever make are the two published Google Sheets CSV fetches
  described below.
- Keep the project buildable and runnable with zero install step — open the
  HTML file (or serve it statically) and it works. No package manager, no
  bundler.

## Architecture

Static files — no server, no build step:

- `mileage-log.html` — markup, `.page` divs for the two printed pages.
- `styles.css` — screen styles + `@media print` overrides.
- `app.js` — Alpine.js component logic and app state.
- `vendor/alpine.min.js` — vendored Alpine.js (no CDN).

### JS approach: Alpine.js

Unlike v1's fully vanilla JS, this project uses **Alpine.js**, vendored
locally. v2's state-sync problem is materially harder than v1's — day count
varies by month, and the entry list / itemized print list / per-trip-type
summary must all stay in sync with one state object — which is what Alpine
is being used to simplify (declarative loops and bindings instead of
hand-written DOM-diffing functions like v1's `buildRows()`/
`updateSummary()`). Keep Alpine usage straightforward — this is still meant
to read like a small, hand-tuned app, not a full SPA architecture.

## State model

- `trips` — a **list**, not a matrix, and a **single live list** rather
  than one per month/year (see Persistence below). Each entry references a
  day and a trip type (identified by a hash of that trip's label + miles —
  see Config below), for days that actually have a trip; "No Trip" days are
  simply absent or null, implementation's call. This replaces both v1's
  `grid[day][trip]` boolean-per-column model and the "grid" terminology
  entirely. Rename accordingly throughout the code (`trips`, not `grid`);
  don't carry over v1's naming.
- Changing Month/Date changes how many day-rows display (days-in-month,
  leap-year aware) but does not clear or filter `trips` content — see
  Persistence below for the Clear Trips button that does that explicitly.
- Trip type definitions and rates are **not hardcoded** — see Config below.
- Name, Employee ID, Address, Rotation, and signature are profile-style
  fields, not month/year-scoped — see Persistence below.

## Config — externally editable via Google Sheets

Trip types and mileage rates are maintained by a non-engineer admin in a
Google Sheet, published to the web as CSV, and fetched by the app at page
load. This is one of the app's only network dependencies (the other being
Google Fonts, which is not used — see CSS below — so in practice it is the
*only* network dependency).

### Structure

One Google Sheet, two tabs, each published to web separately:

- **`Trips` tab** — columns: `label`, `miles`. Row order = dropdown display
  order. Dropdown options render as `"{label} — {miles} mi"` — mileage is
  shown purely as a sanity check when selecting (catching an accidental
  pick of the wrong trip), not because residents need to track mileage
  themselves.
- **`Rates` tab** — columns: `start_date` (format `YYYY-MM-DD`), `rate`.
  Effective-dated: the rate in effect for a given month is whichever row
  has the latest `start_date` that is ≤ the **1st of the selected month**.
  Sort by `start_date` in code — do not assume sheet row order is
  chronological. Only one rate is ever "in play" per submission (forms are
  always monthly).

### Fetch behavior

- Fetch both CSVs on page load only (no polling, no manual refresh
  button).
- On fetch failure: fall back to the last successfully fetched config
  cached in `localStorage`, rather than hard-failing. Surface this state to
  the user (e.g. "using cached config from [time]") rather than failing
  silently.
- On fetch success: cache the result to `localStorage` and display a
  "config last checked: [timestamp]" note in the UI. This is the **last
  successful fetch time**, not the sheet's true last-edited time — a plain
  published CSV response doesn't carry a reliable edit timestamp.
- Document in admin-facing instructions (README, not this file) that
  "Automatically republish when changes are made" must stay checked in the
  Sheet's Publish to web settings.

### Trip identity: hash of label + mileage, not a stable ID

Each dropdown `<option>`'s value (and each stored `trips` entry) is derived
from a hash/composite of that trip's `label` + `miles` as currently
published in the Trips tab — there is **no separate stable ID column** in
the config. This was a deliberate choice, made with the tradeoff understood
and accepted: since trip/rate edits happen rarely (roughly monthly, when
closing out the prior month) rather than continuously, the risk of a
cosmetic edit (typo fix, minor mileage correction) silently invalidating
in-progress selections is considered low.

- On load, each stored `trips` entry's hash is checked against the
  currently fetched Trips config. A match restores that selection normally.
- **A non-match must not silently become "No Trip" with no trace.** Surface
  a visible state on that day's row (e.g. "previous selection no longer
  available — reset to No Trip") so the resident can tell something
  changed and re-select if needed, rather than the row quietly looking like
  it was never filled in. This visible-fallback behavior is a required part
  of this design, not optional polish — it's the safeguard that makes the
  no-stable-ID tradeoff acceptable.
- Do not add a stable/manual trip ID column to the Trips sheet to work
  around this — that was considered and explicitly not chosen.

## Entry UI (page 1, editable)

- One `<select>` per day, count driven by days in the selected month/year
  (leap-year aware).
- Each dropdown pre-selects an explicit **"No Trip"** option.
- Each `<select>` needs its own distinct accessible label (e.g. "Trip for
  June 3") — see Accessibility below.

## Print output

### Page 1 — itemized trip list

- Only days with a trip selected (not "No Trip") get a printed row —
  naturally bounded at 31 rows regardless of how many trip types exist in
  config.
- Single-column layout with a header row labeling the two columns "Date"
  and "Trip" (revised from an earlier two-column 1–15/16–end plan — a
  single column fits easily within the two-page budget even at 31 rows,
  and reads more like a normal list).
- Each row: date (month name + day, e.g. "March 6" — the year appears
  once, in the preamble, not per row), trip label with mileage appended
  (e.g. "Chelsea — 34 mi"). An earlier draft of this spec omitted mileage
  here since it already served its sanity-check purpose at selection
  time; that was revised — mileage is shown on both the entry dropdown
  and the printed itemized row.
- Verify actual print fit at a worst-case month (every day filled) during
  implementation.

### Page 2 — summary

- List only trip types actually used that month.
- Per trip type used: label, number of times used, miles per instance,
  rate, dollar value for that type's cumulative trips.
- Grand total row summing across all used trip types.

## CSS

- Plain CSS, no framework/methodology overhead (no BEM, no utility-class
  system) — the project is small enough that this would add ceremony
  without benefit.
- **Use CSS custom properties (`:root` variables) as design tokens** —
  colors, spacing units, font sizes defined once and referenced throughout,
  rather than repeated literal values. This keeps a hand-maintained
  stylesheet consistent as it grows and makes contrast-ratio checks/fixes a
  one-place change rather than a hunt through the file.
- **System font stack, not Google Fonts.** Unlike v1, do not load an
  external font. Use a standard system stack, e.g.
  `-apple-system, "Segoe UI", Roboto, sans-serif` for body text (and a
  system-serif or the same sans stack for any heading/print-styling role
  v1's serif font previously played — implementation's call, just don't
  reach for a webfont). This removes the app's only other external network
  dependency besides the config CSVs.

## Accessibility

Target **WCAG 2.1 AA** as baseline, folding in cheap-to-satisfy WCAG 2.2
criteria (e.g. minimum target size, focus not obscured) from the start.

- Native `<select>` elements for trip entry — keyboard/screen-reader
  support comes largely for free.
- Every per-day dropdown needs a distinct accessible label/`aria-label`
  tied to its date.
- Color contrast: 4.5:1 normal text, 3:1 large text/UI components —
  including de-emphasized text like the "No Trip" placeholder styling and
  print-only muted styles. Token-based colors (see CSS above) make this
  easier to verify and adjust consistently.
- Icon-only buttons need real accessible names — verify `aria-label`s carry
  the meaning, not just adjacent visible text.
- Preserve visible focus indicators; do not suppress default outlines
  without an equally visible replacement.
- Wire the live-updating page-2 summary through an `aria-live` region.
- Signature capture: canvas drawing is not natively accessible; keep the
  upload-image alternative as the accessible fallback.

## Persistence

Import/export (v1's `.json` file backup/restore) is **removed** in v2.
There is no file-based backup or cross-device transfer mechanism —
`localStorage` is the only persistence layer, which means it is inherently
single-browser, single-device. If a resident switches computers, clears
browser data, or uses a different browser mid-month, that month's entries
are not recoverable. This is an accepted tradeoff for simplicity, not an
oversight — do not silently reintroduce import/export to "fix" this without
being asked.

- **`trips` is a single live list, not scoped per month/year.** There is
  only one `trips` list in storage at a time. Changing the Month/Date
  fields changes how many day-rows are *displayed* (matching the days in
  that month) but does **not** clear or otherwise touch the underlying
  `trips` content. Starting a new month's entries is a manual, explicit
  action — a **Clear Trips** button (carried forward from v1's
  `clearGrid()` pattern, renamed to fit the new model) empties `trips`
  without touching profile fields or signature.
- **Profile fields — persist globally, with no clear button.** Name,
  Employee ID, Address, Rotation, and signature all persist indefinitely
  and are not scoped to month/year. There is intentionally no "clear
  profile" affordance — only `trips` gets a manual clear action. (Rotation
  was previously discussed as month/year-scoped; that's superseded — it's
  a profile-style field now, same as Name/ID/Address.)
- `sessionStorage` — undo/redo history, same pattern as v1, cleared on tab
  close.

## Things to be careful about when changing code

- The Trips/Rates config is the source of truth for what was hardcoded
  `TRIPS`/`RATE` in v1 — don't reintroduce hardcoded trip data "for
  convenience" during development without clearly marking it as a
  temporary stub.
- Rate lookup is always resolved against the **1st of the selected month**,
  never a specific day within it.
- Config fetch is the only legitimate network dependency — don't add
  others without asking, including webfonts.
- Don't reintroduce `grid`/matrix terminology, import/export, or a stable
  trip ID column — all were deliberately removed/not chosen in v2. `trips`
  is a single live list; identity is the label+miles hash, with a visible
  fallback (not a silent one) when a stored entry's hash no longer matches
  current config.
- There's no test suite. Verification is opening the file in a browser and
  checking behavior + print preview visually, same as v1.
