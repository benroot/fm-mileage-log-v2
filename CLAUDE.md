# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this project is

A single-page tool that lets University of Michigan Family Medicine
residency staff track mileage for reimbursement and print a one-page PDF
form to submit. This is **v2** of an earlier hand-built version — the core
purpose is unchanged, but the data model and entry UI are substantially
redesigned to let a non-engineer admin update trip types and mileage rates
without touching code.

The app is still static files served from GitHub Pages: no server, no
per-request backend logic. The one deliberate change from v1 is that it is
**no longer offline-only** — it makes a small number of network calls on
page load to fetch admin-editable config. Everything else about it (no
build step, opened directly by a URL, printable one-page output) should be
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
- `reference/fm-mileage-log-v1/mileage-log.html` — v1's markup. v2 originally
  kept v1's two-page `.page` div structure but has since consolidated to a
  single `.page` div (screen: one continuous scrolling page; print: one
  physical sheet, with the itemized list switching to two CSS columns —
  each with its own repeated header — once there are enough trips to need
  it, see "Print output" below).
- `reference/fm-mileage-log-v1/styles.css` — v1's screen + `@media print`
  styles; the general print-fit discipline (check print preview after any
  layout change) carries forward, the two-page split and the visual design
  (fonts, tokens) do not — see CSS section below.
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
  point of this app is a clean printable PDF, fit to **one US Letter
  page** (`@page { size: letter; margin: 0.45in }` in `@media print`). Any
  layout change is a risk to that fit — always check print preview after
  touching layout, spacing, or content volume. Past 10 itemized trips, the
  print CSS switches the itemized list to two columns (see "Print output"
  below) specifically to preserve the one-page fit — verify that switch
  still holds at a worst-case, every-day-filled month after any change
  near it.
- **No CDN dependencies, no exceptions.** Alpine.js is vendored (committed)
  into the repo, e.g. `vendor/alpine.min.js`, not loaded from an external
  `<script src>`. Unlike v1, this project does **not** load Google Fonts —
  see CSS section below. The **only** external network calls this app
  should ever make are the two published Google Sheets CSV fetches
  described below.
- Keep the project buildable and runnable with zero install step — open the
  HTML file (or serve it statically) and it works. No package manager, no
  bundler.

## Development status / roadmap

Built so far (in this order):

1. Scaffold — `mileage-log.html` / `styles.css` / `app.js` / vendored
   Alpine, design tokens, system fonts. (Originally a two-page structure;
   since consolidated to one page — see "Print output" below.)
2. Entry UI — per-day `<select>` list, leap-year-aware day count,
   print-only itemized list (date + trip label), summary + grand total.
3. Persistence — single `localStorage` blob (`fm_mileage_log_v2`) holding
   `profile` + `period` + `trips`, autosaved via one Alpine `$watch`.
4. Signature capture — upload + draw-canvas patterns carried forward from
   v1 into the Alpine component (see Persistence below for the
   no-clear-button, last-method-used-wins design).
5. Google Sheets config fetch — published-CSV fetch on page load,
   `localStorage` cache + "config last checked" timestamp, fetch-failure
   fallback to cached config, and the required visible (not silent)
   fallback when a stored trip's hash no longer matches current config
   (see "Config" below). **No hardcoded stub trip/rate data** — an early
   `TEMP STUB CONFIG` was used to build the entry UI before this phase,
   but was removed once the real fetch existed: a fake placeholder trip
   list is indistinguishable from real config once rendered, and goes
   stale the moment an admin actually configures the Sheet. If config
   fetch fails and there's no cache either (e.g. first-ever load, no
   network), `tripOptions`/`rates` are simply empty and the UI says so.

Next phase:

6. **Undo/redo** — deliberately deferred past signature + config.
   sessionStorage stack, same pattern as v1 (`pushUndo`/`undo`/`redo`,
   `UNDO_LIMIT`), now that the rest of the state shape (incl. signature)
   has settled.

## Architecture

Static files — no server, no build step:

- `mileage-log.html` — markup: a single `.page` div (screen: one
  continuous scrolling page; print: one physical sheet — see "Print
  output" below). Not named `index.html` — briefly was, to load
  automatically at the GitHub Pages root URL, but was renamed back. The
  Pages root URL will 404 unless/until an `index.html` (e.g. a small
  redirect) is added back alongside it.
- `styles.css` — screen styles + `@media print` overrides.
- `app.js` — Alpine.js component logic and app state.
- `vendor/alpine.min.js` — vendored Alpine.js (no CDN).
- `README.md` — end-user instructions (how to fill out and print the form)
  plus admin instructions for updating trip types/rates via the Google
  Sheet (see "Config" below) — not this file, and not read by the app.

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

### Where the CSV URLs live

The two published-CSV URLs are not hardcoded in `app.js` — they live in
`config.json` at the repo root, fetched alongside the Trips/Rates CSVs on
page load. This keeps the URLs editable via GitHub's web editor without
touching JS, and gives one obvious place to look when the Sheet is
recreated or re-published. `config.json` is plain JSON (not `.env`) because
this is a buildless static site — there's no bundler to inject a `.env`
file into browser-loaded JS at runtime.

### Fetch behavior

- Fetch both CSVs on page load only (no polling, no manual refresh
  button).
- While `loadConfig()` is in flight, a `.loading-overlay` (`configLoading`,
  screen-only) covers the form so nothing partially-loaded — an empty trip
  dropdown, a placeholder `$0.000` rate — is ever visible or interactive.
  Lifted in a `finally` block, so it comes down whether loading ends in
  success, a cache fallback, or no data at all.
- On fetch failure: fall back to the last successfully fetched config
  cached in `localStorage`, rather than hard-failing. Surface this state to
  the user (e.g. "using cached config from [time]") rather than failing
  silently — `configStatusText`, shown screen-only via `.config-status`
  (never printed).
- On fetch success: cache the result to `localStorage`, silently —
  `configStatusText` is cleared and `.config-status` (`x-show`) disappears.
  Only failures/fallbacks are surfaced; the routine happy path doesn't need
  a "config last checked" note cluttering the entry screen. The last
  successful fetch time is still captured in the `localStorage` cache
  itself (`fetchedAt`), just not displayed on a successful load.
- Document in admin-facing instructions (README, not this file) that
  "Automatically republish when changes are made" must stay checked in the
  Sheet's Publish to web settings.

### Trip identity: hash of label + mileage, not a stable ID

Each dropdown `<option>`'s value (and each stored `trips` entry) is derived
from a hash/composite of that trip's `label` + `miles` as currently
published in the Trips tab — there is **no separate stable ID column** in
the config. `hashTrip()` produces a human-readable slug (e.g.
`chelsea-34mi`), not an opaque digest, specifically so a hash mismatch is
legible in localStorage/devtools while debugging — which trip it used to
be is visible at a glance, not just that it changed. This was a deliberate
choice, made with the tradeoff understood and accepted: since trip/rate
edits happen rarely (roughly monthly, when
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
- A `.help-link` in the header links to README.md's **rendered GitHub blob
  view** (`.../blob/main/README.md`), not a relative `README.md` link —
  GitHub Pages serves `.md` files as raw markdown text (no front matter to
  trigger Jekyll's conversion), so a same-origin link would show unstyled
  markdown source instead of a readable page. Screen-only.
- A `.policy-warning` banner ("During elective, ONLY Continuity Clinics
  qualify for mileage reimbursement") sits above the entry table, visible
  in **both** screen and print (same precedent as `.uber-line`'s cab/Uber
  note) — it's compliance-relevant enough that the program coordinator
  reviewing the printed form should see it too, not just the resident
  filling it out on screen. Hardcoded program policy text, not
  Sheet-driven config — don't move it into the Trips/Rates config without
  being asked.

## Print output

### Itemized trip list

- Only days with a trip selected (not "No Trip") get a printed row —
  naturally bounded at 31 rows regardless of how many trip types exist in
  config.
- Single column normally, with a header row labeling the columns "#",
  "Date", and "Trip". Past 10 rows, switches to two side-by-side columns
  — each with its own repeated header — so the list keeps the whole form
  to one page (see `itemizedTwoColumn` / `itemizedColumns` in `app.js`;
  revised from an even earlier two-column 1–15/16–end plan, which split by
  fixed day range rather than adapting to how many trips are actually
  used).
- Each row is numbered with a running count (not restarted per column) so
  the last number printed can be checked against the summary's trip
  totals; the number is styled visually de-emphasized (muted color,
  smaller, not bold) since it's a cross-check aid, not primary content.
- Each row: date as `MM/DD (Weekday)` (e.g. "03/06 (Fri)" — the year
  appears once, in the preamble, not per row), then the trip label alone,
  **no mileage restated here**. (This spec has gone back and forth on
  mileage-in-the-row more than once — v2 first omitted it, then added it
  back reasoning it doubled as a sanity check, and now omits it again in
  favor of a compact row, since the mileage is already visible on the
  entry dropdown at selection time.)
- Verify actual print fit at a worst-case month (every day filled) after
  any change near this list.

### Summary

- List only trip types actually used that month.
- Per trip type used: label, number of times used, miles per instance,
  and that type's **subtotal miles** (count × miles) — not a dollar
  amount. No per-type row ever computes its own dollars.
- Below the per-type rows, two label/value total lines (same layout as
  the per-type rows: label left, value right), split by which side of the
  final divider they sit on:
  1. **"Total Miles (N trips)"** (`.sum-subtotal-row`, above the divider —
     styled as one more, bolder line in the itemized list, light border
     matching the per-type rows' own separator) — all rows' subtotal
     miles summed (`totalMiles`), labeled with the trip count so it can
     be cross-checked against the itemized list's last row number.
  2. **"Reimbursement Request (`totalMiles` mi × $rate/mi)"**
     (`.sum-grand-row`, below the strong navy divider — the final figure)
     — the calculation spelled out in the label itself (not
     de-emphasized — same label styling as the line above), with
     `"= $" + grandTotal` right-justified at the larger size reserved for
     the final figure. Since only one rate is ever in play per submission
     (see "Rates tab" above), this is the only place the rate is stated —
     there's no separate rate note elsewhere in the summary.

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
  `TRIPS`/`RATE` in v1 — don't reintroduce a hardcoded trip/rate stub "for
  convenience," even marked clearly, even temporarily. This was tried
  during early development and deliberately removed: a stub is
  indistinguishable from real config once rendered, it goes stale the
  moment the Sheet is actually configured, and it already caused a real
  bug (a stored trip selection silently failed to restore because its
  stub-era hash didn't match the real one). If config isn't loaded yet or
  couldn't be loaded, show that state honestly (empty `tripOptions`/empty
  `rates`, a clear status message) rather than substituting fake data.
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
