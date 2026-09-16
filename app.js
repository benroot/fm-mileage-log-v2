// Deterministic, human-readable slug of label+miles → trip identity, not a
// stable ID (see CLAUDE.md). Readable in localStorage/devtools, so a hash
// mismatch during debugging shows which trip it used to be instead of an
// opaque hex digest.
function hashTrip(label, miles) {
  const slug = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug}-${miles}mi`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Persistence — single localStorage blob (profile + period + trips) ──
// trips is a single live list, not scoped per month/year (see CLAUDE.md).
const STORAGE_KEY = 'fm_mileage_log_v2';
// Separate cache for the fetched Trips/Rates config (see loadConfig below) —
// distinct lifetime/purpose from the profile/period/trips blob above.
const CONFIG_STORAGE_KEY = 'fm_mileage_log_v2_config';

// ── CSV parsing — minimal, handles quoted fields (commas/quotes inside a
// cell), since this is admin-edited data, not a fixed machine format. ──
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// Header cells are admin-typed, so match loosely: lowercase, strip
// everything but letters/digits (so "Start Date" / "Rate ($/mile)" both
// still match), try an exact match first, then a "starts with" match.
function normalizeHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}
function findColumn(headerRow, aliases) {
  const normalized = headerRow.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  for (const alias of aliases) {
    const idx = normalized.findIndex(h => h.startsWith(alias));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Accepts "YYYY-MM-DD" or "YYYY/MM/DD" (with 1- or 2-digit month/day),
// normalized to zero-padded "YYYY-MM-DD" so string comparison in
// currentRate keeps working regardless of which separator the sheet uses.
function parseCsvDate(str) {
  const m = String(str).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function parseTripsCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Trips CSV is empty');
  const [header, ...dataRows] = rows;
  const labelIdx = findColumn(header, ['label']);
  const milesIdx = findColumn(header, ['miles', 'mileage']);
  if (labelIdx === -1 || milesIdx === -1) throw new Error('Trips CSV missing label/miles columns');
  const trips = [];
  for (const r of dataRows) {
    const label = (r[labelIdx] || '').trim();
    const miles = parseFloat(r[milesIdx]);
    if (!label || !Number.isFinite(miles)) continue;
    trips.push({ label, miles });
  }
  if (!trips.length) throw new Error('Trips CSV has no valid rows');
  return trips;
}

function parseRatesCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Rates CSV is empty');
  const [header, ...dataRows] = rows;
  const dateIdx = findColumn(header, ['startdate']);
  const rateIdx = findColumn(header, ['rate']);
  if (dateIdx === -1 || rateIdx === -1) throw new Error('Rates CSV missing start_date/rate columns');
  const rates = [];
  for (const r of dataRows) {
    const start_date = parseCsvDate(r[dateIdx]);
    const rate = parseFloat(r[rateIdx]);
    if (!start_date || !Number.isFinite(rate)) continue;
    rates.push({ start_date, rate });
  }
  if (!rates.length) throw new Error('Rates CSV has no valid rows');
  rates.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return rates;
}

function mileageLog() {
  return {
    // ── Config — empty until loadConfig() resolves on page load. No
    // hardcoded stub: a fake placeholder trip list would look identical to
    // real config once rendered, and would silently go stale the moment an
    // admin actually configures the Sheet (see CLAUDE.md "Config"). ──
    tripOptions: [],
    rates: [],
    configStatusText: 'Loading trip/rate config…',

    // ── Profile (persists globally; not month/year-scoped) ──
    // sigSource records which method ('upload'|'draw') produced the current
    // signature, so the capture UI can default to that method and — for a
    // drawn signature — avoid silently wiping it when the Draw tab reopens.
    profile: {
      name: '', empid: '', addr: '', rotation: '', date: '', signature: null, sigSource: null
    },

    // ── Signature capture UI state — ephemeral, not persisted ──
    sigMode: 'upload', // 'upload' | 'draw'
    drawEditing: true, // false = showing the saved drawn signature "locked"; must click Redraw to edit
    canvasReady: false,
    isDrawing: false,
    hasStrokes: false,
    lastX: 0,
    lastY: 0,

    // ── Period — controls how many day-rows display ──
    period: {
      month: new Date().getMonth(),
      year: new Date().getFullYear(),
    },

    // ── Trips — single live list keyed by day number, value = trip hash or '' ──
    trips: {},
    resetNotices: {},

    get daysInMonth() {
      const count = new Date(this.period.year, this.period.month + 1, 0).getDate();
      return Array.from({ length: count }, (_, i) => i + 1);
    },

    get monthNames() { return MONTH_NAMES; },

    get currentRate() {
      const cutoff = `${this.period.year}-${String(this.period.month + 1).padStart(2, '0')}-01`;
      let applicable = null;
      for (const r of this.rates) {
        if (r.start_date <= cutoff) applicable = r;
        else break;
      }
      return applicable ? applicable.rate : (this.rates[0] ? this.rates[0].rate : 0);
    },

    onTripChange(day) {
      // Selecting a trip clears any stale "reset" notice for that day.
      delete this.resetNotices[day];
    },

    weekdayFor(day) {
      return WEEKDAY_NAMES[new Date(this.period.year, this.period.month, day).getDay()];
    },

    get itemizedTrips() {
      const rows = [];
      const mm = String(this.period.month + 1).padStart(2, '0');
      for (const day of this.daysInMonth) {
        const hash = this.trips[day];
        if (!hash) continue;
        const opt = this.tripOptions.find(o => o.hash === hash);
        if (!opt) continue;
        const dd = String(day).padStart(2, '0');
        rows.push({ day, dateLabel: `${mm}/${dd} (${this.weekdayFor(day)})`, label: opt.label });
      }
      // Numbered so the last row's number can be checked against the
      // summary's trip counts for a quick accuracy cross-check.
      rows.forEach((row, i) => { row.num = i + 1; });
      return rows;
    },

    // Past this many rows, a single column runs long enough that printing
    // needs two columns to keep the itemized list on one page.
    get itemizedTwoColumn() {
      return this.itemizedTrips.length > 10;
    },

    // Two-column print layout: each column gets its own "Date/Trip" header,
    // so the numbering split just carries straight through (not restarted).
    get itemizedColumns() {
      const rows = this.itemizedTrips;
      const half = Math.ceil(rows.length / 2);
      return [rows.slice(0, half), rows.slice(half)];
    },

    // Each row totals its own miles only — dollars are never computed
    // per-row. Total miles are summed across all rows first, then
    // converted to dollars once via currentRate (see grandTotal), rather
    // than summing per-row dollar amounts.
    get summaryRows() {
      const counts = {};
      for (const day of this.daysInMonth) {
        const hash = this.trips[day];
        if (!hash) continue;
        counts[hash] = (counts[hash] || 0) + 1;
      }
      return this.tripOptions
        .filter(opt => counts[opt.hash])
        .map(opt => {
          const count = counts[opt.hash];
          return {
            hash: opt.hash,
            label: opt.label,
            miles: opt.miles,
            count,
            subtotalMiles: count * opt.miles,
          };
        });
    },

    get totalMiles() {
      return this.summaryRows.reduce((sum, r) => sum + r.subtotalMiles, 0);
    },

    get grandTotal() {
      return this.totalMiles * this.currentRate;
    },

    clearTrips() {
      if (!confirm('Clear all selected trips for this list? This cannot be undone.')) return;
      this.trips = {};
      this.resetNotices = {};
    },

    // ── Config fetch — published Google Sheets CSVs, fetched on page load
    // only (see CLAUDE.md "Config"). Falls back to the last cached config on
    // failure; if there's no cache either, tripOptions/rates simply stay
    // empty. Both states are surfaced in configStatusText, never silent. ──
    async loadConfig() {
      try {
        const configRes = await fetch('config.json');
        if (!configRes.ok) throw new Error('config.json fetch failed: ' + configRes.status);
        const cfg = await configRes.json();
        if (!cfg.tripsCsvUrl || !cfg.ratesCsvUrl) throw new Error('config.json missing tripsCsvUrl/ratesCsvUrl');

        const [tripsText, ratesText] = await Promise.all([
          fetch(cfg.tripsCsvUrl).then(r => { if (!r.ok) throw new Error('Trips CSV fetch failed: ' + r.status); return r.text(); }),
          fetch(cfg.ratesCsvUrl).then(r => { if (!r.ok) throw new Error('Rates CSV fetch failed: ' + r.status); return r.text(); }),
        ]);

        const trips = parseTripsCsv(tripsText);
        const rates = parseRatesCsv(ratesText);
        const fetchedAt = new Date();

        try {
          localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ trips, rates, fetchedAt: fetchedAt.toISOString() }));
        } catch (e) { /* localStorage unavailable/full — cache write silently skipped */ }

        this.applyFetchedConfig(trips, rates);
        this.configStatusText = `Config last checked: ${fetchedAt.toLocaleString()}`;
      } catch (err) {
        let cached;
        try { cached = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY)); } catch (e) {}
        if (cached && cached.trips && cached.rates) {
          this.applyFetchedConfig(cached.trips, cached.rates);
          this.configStatusText = `Could not reach Google Sheets — using cached config from ${new Date(cached.fetchedAt).toLocaleString()}.`;
        } else {
          this.configStatusText = 'Could not load trip/rate config and no cached copy is available — no trip types or rate loaded. Check your connection and reload.';
        }
      }
    },

    applyFetchedConfig(trips, rates) {
      this.tripOptions = trips.map(t => ({ ...t, hash: hashTrip(t.label, t.miles) }));
      this.rates = [...rates].sort((a, b) => a.start_date.localeCompare(b.start_date));
      this.reconcileTripsAgainstConfig();
    },

    // A stored trip's hash may no longer exist in the current config (its
    // label/miles were edited or the row removed upstream). Silently
    // dropping it to "No Trip" would hide that something changed, so flag
    // it visibly instead via resetNotices (see CLAUDE.md "Trip identity").
    reconcileTripsAgainstConfig() {
      const validHashes = new Set(this.tripOptions.map(o => o.hash));
      for (const day of Object.keys(this.trips)) {
        const hash = this.trips[day];
        if (hash && !validHashes.has(hash)) {
          this.trips[day] = '';
          this.resetNotices[day] = true;
        }
      }
    },

    // ── Signature capture — profile-style field, no clear button (see CLAUDE.md).
    // Re-uploading or re-drawing overwrites the stored signature. ──
    setSigMode(mode) {
      this.sigMode = mode;
      if (mode !== 'draw') return;
      // Re-entering Draw always re-locks onto the last saved drawn signature
      // (if any) rather than resuming a stale in-progress canvas.
      if (this.profile.signature && this.profile.sigSource === 'draw') {
        this.drawEditing = false;
      } else {
        this.enterDrawEditing();
      }
    },

    enterDrawEditing() {
      this.drawEditing = true;
      this.$nextTick(() => {
        if (this.canvasReady) this.clearCanvas();
        else this.initCanvas();
      });
    },

    startRedraw() {
      if (!confirm('This will clear your saved signature so you can draw a new one. Continue?')) return;
      this.enterDrawEditing();
    },

    onSignatureFile(e) {
      const file = e.target.files[0];
      e.target.value = ''; // allow re-selecting the same file later
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          // Downsample to a small canvas so the stored data URL stays compact.
          const maxW = 280, maxH = 38, scale = 3;
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          const dispW = Math.round(img.width * ratio);
          const dispH = Math.round(img.height * ratio);
          const canvas = document.createElement('canvas');
          canvas.width = dispW * scale;
          canvas.height = dispH * scale;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          this.profile.signature = canvas.toDataURL('image/png');
          this.profile.sigSource = 'upload';
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    },

    initCanvas() {
      if (this.canvasReady) return;
      const canvas = this.$refs.sigCanvas;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2; // 2x for retina
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.canvasReady = true;

      const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return { x: src.clientX - r.left, y: src.clientY - r.top };
      };
      const startDraw = (e) => {
        e.preventDefault();
        this.isDrawing = true;
        const p = getPos(e);
        this.lastX = p.x; this.lastY = p.y;
        ctx.beginPath();
        ctx.moveTo(this.lastX, this.lastY);
      };
      const draw = (e) => {
        e.preventDefault();
        if (!this.isDrawing) return;
        const p = getPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        this.lastX = p.x; this.lastY = p.y;
        this.hasStrokes = true;
      };
      const endDraw = () => { this.isDrawing = false; };

      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', endDraw);
      canvas.addEventListener('mouseleave', endDraw);
      canvas.addEventListener('touchstart', startDraw, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', endDraw);
    },

    clearCanvas() {
      if (!this.canvasReady) return;
      const canvas = this.$refs.sigCanvas;
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      this.hasStrokes = false;
    },

    saveDrawnSignature() {
      if (!this.canvasReady || !this.hasStrokes) {
        alert('Please draw your signature first.');
        return;
      }
      this.profile.signature = this.$refs.sigCanvas.toDataURL('image/png');
      this.profile.sigSource = 'draw';
      this.drawEditing = false; // lock — require Redraw to edit again
    },

    saveState() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          profile: this.profile,
          period: this.period,
          trips: this.trips,
        }));
      } catch (e) { /* localStorage unavailable/full — autosave silently skipped */ }
    },

    init() {
      let saved;
      try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}

      if (saved && saved.profile) Object.assign(this.profile, saved.profile);
      if (saved && saved.period) Object.assign(this.period, saved.period);

      if (!this.profile.date) {
        const today = new Date();
        this.profile.date = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      }

      // Default the signature tab to whichever method last produced the
      // saved signature; a drawn one starts locked (see setSigMode).
      if (this.profile.signature && this.profile.sigSource === 'draw') {
        this.sigMode = 'draw';
        this.drawEditing = false;
      }

      // Restoring trips must wait for loadConfig() to fully resolve (fetch,
      // cache, or stub fallback) and for that config's <option> elements to
      // actually render, not just for the initial mount. If trips were
      // restored against the transient placeholder config instead, the
      // <select> would try to match a stored hash against placeholder
      // options, fail to find one, and default to showing "No Trip" —
      // even though trips[day] itself is still correct — because Alpine's
      // x-model doesn't retroactively re-sync a <select> just because its
      // sibling <option>s changed later for an unrelated reason. (This is
      // what made a trip like "Chelsea & Ypsi" appear to revert to "No
      // Trip" after a refresh while "Chelsea" alone didn't: "Chelsea"
      // happens to hash identically in both the placeholder and real
      // config, masking the race.)
      this.$nextTick(async () => {
        await this.loadConfig();
        await new Promise(resolve => this.$nextTick(resolve));
        if (saved && saved.trips) Object.assign(this.trips, saved.trips);
        this.reconcileTripsAgainstConfig();
      });

      this.$watch(
        () => JSON.stringify({ profile: this.profile, period: this.period, trips: this.trips }),
        () => this.saveState()
      );
    },
  };
}
