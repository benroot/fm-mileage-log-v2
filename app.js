// ══════════════════════════════════════════════
//  TEMP STUB CONFIG — placeholder only.
//  Real config comes from published Google Sheets CSVs (Trips tab,
//  Rates tab) fetched on page load. Not wired up yet — this stub exists
//  so the entry UI / print layout can be built and reviewed first.
//  See CLAUDE.md "Config" section for the real fetch/cache/fallback design.
// ══════════════════════════════════════════════
const STUB_TRIPS = [
  { label: "Chelsea", miles: 34 },
  { label: "Chelsea→Ypsilanti", miles: 54 },
  { label: "Ypsilanti", miles: 24 },
  { label: "Dexter", miles: 18 },
  { label: "Northville", miles: 50 },
  { label: "Livonia", miles: 56 },
];
const STUB_RATES = [
  { start_date: "2026-01-01", rate: 0.725 },
  { start_date: "2026-08-01", rate: 0.76 },
];

// Simple deterministic string hash (FNV-1a) → hex string.
// Used as trip identity: hash of label+miles, not a stable ID (see CLAUDE.md).
function hashTrip(label, miles) {
  const str = `${label}|${miles}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Persistence — single localStorage blob (profile + period + trips) ──
// trips is a single live list, not scoped per month/year (see CLAUDE.md).
const STORAGE_KEY = 'fm_mileage_log_v2';

function mileageLog() {
  return {
    // ── Config (stubbed for now) ──
    tripOptions: STUB_TRIPS.map(t => ({ ...t, hash: hashTrip(t.label, t.miles) })),
    rates: [...STUB_RATES].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    configStatusText: 'Using temporary stub trip/rate data — Google Sheets config not yet connected.',

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

    get itemizedTrips() {
      const rows = [];
      const monthName = MONTH_NAMES[this.period.month];
      for (const day of this.daysInMonth) {
        const hash = this.trips[day];
        if (!hash) continue;
        const opt = this.tripOptions.find(o => o.hash === hash);
        if (!opt) continue;
        rows.push({ day, dateLabel: `${monthName} ${day}`, label: `${opt.label} — ${opt.miles} mi` });
      }
      return rows;
    },

    get summaryRows() {
      const counts = {};
      for (const day of this.daysInMonth) {
        const hash = this.trips[day];
        if (!hash) continue;
        counts[hash] = (counts[hash] || 0) + 1;
      }
      const rate = this.currentRate;
      return this.tripOptions
        .filter(opt => counts[opt.hash])
        .map(opt => {
          const count = counts[opt.hash];
          return {
            hash: opt.hash,
            label: opt.label,
            miles: opt.miles,
            rate,
            count,
            amount: count * opt.miles * rate,
          };
        });
    },

    get grandTotal() {
      return this.summaryRows.reduce((sum, r) => sum + r.amount, 0);
    },

    get p2Subtitle() {
      const monthLabel = `${MONTH_NAMES[this.period.month]} ${this.period.year}`;
      return this.profile.name ? `${this.profile.name} — ${monthLabel}` : monthLabel;
    },

    clearTrips() {
      if (!confirm('Clear all selected trips for this list? This cannot be undone.')) return;
      this.trips = {};
      this.resetNotices = {};
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

      // Restoring trips is deferred to $nextTick: each day's <select> options
      // are populated by a nested x-for, so assigning trips synchronously here
      // (before those options exist in the DOM) would leave the <select>
      // showing "No Trip" even though the underlying data is correct. Assigning
      // after mount makes the reactive write happen once options already exist,
      // so x-model's DOM sync finds the matching option.
      this.$nextTick(() => {
        if (saved && saved.trips) Object.assign(this.trips, saved.trips);
      });

      this.$watch(
        () => JSON.stringify({ profile: this.profile, period: this.period, trips: this.trips }),
        () => this.saveState()
      );
    },
  };
}
