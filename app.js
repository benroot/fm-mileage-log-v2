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

function mileageLog() {
  return {
    // ── Config (stubbed for now) ──
    tripOptions: STUB_TRIPS.map(t => ({ ...t, hash: hashTrip(t.label, t.miles) })),
    rates: [...STUB_RATES].sort((a, b) => a.start_date.localeCompare(b.start_date)),
    configStatusText: 'Using temporary stub trip/rate data — Google Sheets config not yet connected.',

    // ── Profile (persists globally; not month/year-scoped) ──
    profile: {
      name: '', empid: '', addr: '', rotation: '', date: ''
    },

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

    init() {
      if (!this.profile.date) {
        const today = new Date();
        this.profile.date = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
      }
    },
  };
}
