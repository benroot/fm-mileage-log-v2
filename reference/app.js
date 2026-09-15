// ══════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════
const TRIPS = [
  { miles: 34,    label: "Chelsea",          short: "CHE" },
  { miles: 54,    label: "Chelsea→Ypsilanti", short: "CHE→YHC" },
  { miles: 24,    label: "Ypsilanti",         short: "YHC" },
  { miles: 18,    label: "Dexter",            short: "Dexter" },
  { miles: 34.5,  label: "Chelsea→Dexter",   short: "CHE→Dxt" },
  { miles: 50,    label: "Northville",        short: "Northville" },
  { miles: 56,    label: "Livonia",           short: "Livonia" },
  { miles: 82,    label: "Luke Clinic",       short: "Luke" },
  { miles: 116,   label: "Hamilton/Flint",   short: "Flint" },
];
let RATE = 0.725;
const TOTAL_DAYS = 31;

// State: grid[day][trip] = true/false (day 1-based, trip 1-based)
const grid = {};
for (let d = 1; d <= TOTAL_DAYS; d++) {
  grid[d] = {};
  for (let t = 1; t <= 9; t++) grid[d][t] = false;
}

// ══════════════════════════════════════════════
//  BUILD ROWS
// ══════════════════════════════════════════════
function buildRows() {
  const body1 = document.getElementById('grid-body-1');
  body1.innerHTML = '';

  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const tr = document.createElement('tr');

    // Day number cell
    const tdDay = document.createElement('td');
    tdDay.className = 'day-num';
    tdDay.textContent = d;
    tr.appendChild(tdDay);

    // Indicator cell (auto, read-only)
    const tdInd = document.createElement('td');
    tdInd.className = 'ind-cell';
    const cbInd = document.createElement('input');
    cbInd.type = 'checkbox';
    cbInd.id = `r${d}_ind`;
    cbInd.tabIndex = -1;
    tdInd.appendChild(cbInd);
    tr.appendChild(tdInd);

    // Trip cells 1–9
    for (let t = 1; t <= 9; t++) {
      const td = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `r${d}_t${t}`;
      cb.checked = grid[d][t];
      cb.addEventListener('change', () => onTripChange(d, t, cb.checked));
      td.appendChild(cb);
      tr.appendChild(td);
    }

    body1.appendChild(tr);
  }

  updateAllIndicators();
  updateSummary();
}

// ══════════════════════════════════════════════
//  LOGIC
// ══════════════════════════════════════════════
function onTripChange(day, trip, checked) {
  pushUndo();
  if (checked) {
    // Uncheck all other trips in this row
    for (let t = 1; t <= 9; t++) {
      if (t !== trip) {
        grid[day][t] = false;
        const cb = document.getElementById(`r${day}_t${t}`);
        if (cb) cb.checked = false;
      }
    }
    grid[day][trip] = true;
  } else {
    grid[day][trip] = false;
  }
  updateIndicator(day);
  updateSummary();
  saveState();
}

function updateIndicator(day) {
  const anyChecked = Object.values(grid[day]).some(v => v);
  const ind = document.getElementById(`r${day}_ind`);
  if (ind) ind.checked = anyChecked;
}

function updateAllIndicators() {
  for (let d = 1; d <= TOTAL_DAYS; d++) updateIndicator(d);
}

function getTotals() {
  const totals = Array(9).fill(0);
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    for (let t = 1; t <= 9; t++) {
      if (grid[d][t]) totals[t-1]++;
    }
  }
  return totals;
}

function updateSummary() {
  const totals = getTotals();
  const body = document.getElementById('summary-body');
  body.innerHTML = '';

  let grandTotal = 0;

  totals.forEach((count, i) => {
    const trip = TRIPS[i];
    const amount = count * trip.miles * RATE;
    grandTotal += amount;

    const row = document.createElement('div');
    row.className = 'summary-row';
    row.innerHTML = `
      <span class="sum-trip-num">${i+1}</span>
      <span class="sum-count">${count}</span>
      <span class="sum-desc">trip${count!==1?'s':''} × ${trip.miles} mi × $${RATE}/mi</span>
      <span class="sum-equals">=</span>
      <span class="sum-amount">$${amount.toFixed(2)}</span>
    `;
    body.appendChild(row);
  });

  const totalRow = document.createElement('div');
  totalRow.className = 'sum-total-row';
  totalRow.innerHTML = `
    <span class="sum-total-label">Total Reimbursement</span>
    <span class="sum-total-amount">$${grandTotal.toFixed(2)}</span>
  `;
  body.appendChild(totalRow);
}

// ══════════════════════════════════════════════
//  RATE SELECTION — derived from the selected month
// ══════════════════════════════════════════════
const RATE_JAN_JUL = 0.725;
const RATE_AUG_DEC = 0.76;
const JAN_JUL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul'];

function getRateForMonth(month) {
  if (!month) return RATE_JAN_JUL; // no month picked yet — default to the current rate
  return JAN_JUL_MONTHS.includes(month) ? RATE_JAN_JUL : RATE_AUG_DEC;
}

function updateRateFromMonth() {
  const selected = document.querySelector('.month-cb:checked');
  RATE = getRateForMonth(selected ? selected.value : null);
  updateRateDisplay();
}

function updateRateDisplay() {
  document.getElementById('footer-rate').textContent = `$${RATE}`;
  document.getElementById('trip-rate-display').textContent = `$${RATE}`;
  document.getElementById('rate-badge').textContent = `Rate: $${RATE}/mi`;
}

// ══════════════════════════════════════════════
//  UNDO — sessionStorage history stack
// ══════════════════════════════════════════════
const UNDO_KEY = 'mileage_log_undo';
const REDO_KEY = 'mileage_log_redo';
const UNDO_LIMIT = 20;

function currentSnapshot() {
  const sigData = document.getElementById('sig-img').src;
  return {
    name:      document.getElementById('f-name').value,
    empid:     document.getElementById('f-empid').value,
    addr:      document.getElementById('f-addr').value,
    rotation:  document.getElementById('f-rotation').value,
    year:      '26',
    date:      document.getElementById('f-date').value,
    months:    [...document.querySelectorAll('.month-cb:checked')].map(c => c.value),
    grid:      JSON.parse(JSON.stringify(grid)),
    signature: sigData && sigData.startsWith('data:') ? sigData : null
  };
}

function pushUndo() {
  let stack;
  try { stack = JSON.parse(sessionStorage.getItem(UNDO_KEY)) || []; } catch { stack = []; }
  stack.push(currentSnapshot());
  if (stack.length > UNDO_LIMIT) stack.shift();
  try { sessionStorage.setItem(UNDO_KEY, JSON.stringify(stack)); } catch(e) {}
  // Any new action clears the redo stack
  try { sessionStorage.removeItem(REDO_KEY); } catch(e) {}
  updateUndoRedo();
}

function applySnapshot(saved) {
  if (saved.name     != null) document.getElementById('f-name').value     = saved.name;
  if (saved.empid    != null) document.getElementById('f-empid').value    = saved.empid;
  if (saved.addr     != null) document.getElementById('f-addr').value     = saved.addr;
  if (saved.rotation != null) document.getElementById('f-rotation').value = saved.rotation;
  if (saved.date     != null) document.getElementById('f-date').value     = saved.date;
  if (saved.signature) applySignature(saved.signature);
  else clearSignature(null);
  if (saved.months) {
    document.querySelectorAll('.month-cb').forEach(cb => {
      cb.checked = saved.months.includes(cb.value);
    });
  }
  updateRateFromMonth();
  if (saved.grid) {
    for (let d = 1; d <= TOTAL_DAYS; d++)
      for (let t = 1; t <= 9; t++)
        grid[d][t] = !!(saved.grid[d] && saved.grid[d][t]);
  }
  updateAllIndicators();
  updateP2Subtitle();
  updateSummary();
  saveState();
}

function undo() {
  let undoStack, redoStack;
  try { undoStack = JSON.parse(sessionStorage.getItem(UNDO_KEY)) || []; } catch { undoStack = []; }
  try { redoStack = JSON.parse(sessionStorage.getItem(REDO_KEY)) || []; } catch { redoStack = []; }
  if (undoStack.length === 0) return;
  redoStack.push(currentSnapshot());
  const snapshot = undoStack.pop();
  try { sessionStorage.setItem(UNDO_KEY, JSON.stringify(undoStack)); } catch(e) {}
  try { sessionStorage.setItem(REDO_KEY, JSON.stringify(redoStack)); } catch(e) {}
  applySnapshot(snapshot);
  updateUndoRedo();
}

function redo() {
  let undoStack, redoStack;
  try { undoStack = JSON.parse(sessionStorage.getItem(UNDO_KEY)) || []; } catch { undoStack = []; }
  try { redoStack = JSON.parse(sessionStorage.getItem(REDO_KEY)) || []; } catch { redoStack = []; }
  if (redoStack.length === 0) return;
  undoStack.push(currentSnapshot());
  const snapshot = redoStack.pop();
  try { sessionStorage.setItem(UNDO_KEY, JSON.stringify(undoStack)); } catch(e) {}
  try { sessionStorage.setItem(REDO_KEY, JSON.stringify(redoStack)); } catch(e) {}
  applySnapshot(snapshot);
  updateUndoRedo();
}

function updateUndoRedo() {
  let undoStack, redoStack;
  try { undoStack = JSON.parse(sessionStorage.getItem(UNDO_KEY)) || []; } catch { undoStack = []; }
  try { redoStack = JSON.parse(sessionStorage.getItem(REDO_KEY)) || []; } catch { redoStack = []; }
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

let undoDebounceTimer = null;
function pushUndoDebounced() {
  clearTimeout(undoDebounceTimer);
  undoDebounceTimer = setTimeout(pushUndo, 500);
}

// ══════════════════════════════════════════════
//  PERSISTENCE — localStorage auto-save / load
// ══════════════════════════════════════════════
const STORAGE_KEY = 'mileage_log_v3';

function saveState() {
  const sigData = document.getElementById('sig-img').src;
  const fields = {
    name:     document.getElementById('f-name').value,
    empid:    document.getElementById('f-empid').value,
    addr:     document.getElementById('f-addr').value,
    rotation: document.getElementById('f-rotation').value,
    year:     '26',
    date:     document.getElementById('f-date').value,
    months:   [...document.querySelectorAll('.month-cb:checked')].map(c => c.value),
    grid:     grid,
    signature: sigData && sigData.startsWith('data:') ? sigData : null
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fields)); } catch(e) {}
}

function loadState() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) {}
  if (!saved) return false;

  // Restore text fields
  if (saved.name     != null) document.getElementById('f-name').value     = saved.name;
  if (saved.empid    != null) document.getElementById('f-empid').value    = saved.empid;
  if (saved.addr     != null) document.getElementById('f-addr').value     = saved.addr;
  if (saved.rotation != null) document.getElementById('f-rotation').value = saved.rotation;
  if (saved.date     != null) document.getElementById('f-date').value     = saved.date;

  // Restore signature
  if (saved.signature) applySignature(saved.signature);

  // Restore month checkboxes
  if (saved.months) {
    document.querySelectorAll('.month-cb').forEach(cb => {
      cb.checked = saved.months.includes(cb.value);
    });
  }

  // Rate is derived from the selected month, not stored independently
  updateRateFromMonth();

  // Restore grid state
  if (saved.grid) {
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      for (let t = 1; t <= 9; t++) {
        grid[d][t] = !!(saved.grid[d] && saved.grid[d][t]);
      }
    }
  }
  return true;
}

function clearGrid() {
  if (!confirm('Clear all checkboxes from the mileage grid?')) return;
  pushUndo();
  for (let d = 1; d <= TOTAL_DAYS; d++)
    for (let t = 1; t <= 9; t++) grid[d][t] = false;
  document.querySelectorAll('input[type=checkbox][id^="r"]').forEach(cb => {
    cb.checked = false;
  });
  updateSummary();
  saveState();
}

function exportJSON() {
  const sigData = document.getElementById('sig-img').src;
  const data = {
    name:      document.getElementById('f-name').value,
    empid:     document.getElementById('f-empid').value,
    addr:      document.getElementById('f-addr').value,
    rotation:  document.getElementById('f-rotation').value,
    year:      '26',
    date:      document.getElementById('f-date').value,
    months:    [...document.querySelectorAll('.month-cb:checked')].map(c => c.value),
    grid:      grid,
    signature: sigData && sigData.startsWith('data:') ? sigData : null
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const month = data.months[0] || 'unknown';
  a.download = `mileage-log-${month}-${data.year || ''}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = function(e) {
    let saved;
    try { saved = JSON.parse(e.target.result); } catch { alert('Invalid JSON file — could not parse.'); return; }

    // Validate: must have at least one recognizable field
    const knownFields = ['name','empid','addr','rotation','date','months','grid','signature'];
    const found = knownFields.filter(k => saved[k] != null);
    if (found.length === 0) {
      alert('This file does not appear to be a mileage log export.');
      return;
    }

    // Build summary of what will change
    const lines = [];
    if (saved.name     != null) lines.push(`  Name: "${saved.name}"`);
    if (saved.empid    != null) lines.push(`  Employee ID: "${saved.empid}"`);
    if (saved.addr     != null) lines.push(`  Address: "${saved.addr}"`);
    if (saved.rotation != null) lines.push(`  Rotation: "${saved.rotation}"`);
    if (saved.date     != null) lines.push(`  Date: "${saved.date}"`);
    if (saved.months   != null) lines.push(`  Month(s): ${saved.months.join(', ') || '(none)'}`);
    if (saved.grid     != null) {
      let checked = 0;
      for (let d = 1; d <= TOTAL_DAYS; d++)
        for (let t = 1; t <= 9; t++)
          if (saved.grid[d] && saved.grid[d][t]) checked++;
      lines.push(`  Mileage grid: ${checked} trip${checked !== 1 ? 's' : ''} checked`);
    }
    if (saved.signature) lines.push('  Signature: included');

    if (!confirm('Import will overwrite the current form with the following data:\n\n' + lines.join('\n') + '\n\nContinue?')) return;
    pushUndo();

    if (saved.name     != null) document.getElementById('f-name').value     = saved.name;
    if (saved.empid    != null) document.getElementById('f-empid').value    = saved.empid;
    if (saved.addr     != null) document.getElementById('f-addr').value     = saved.addr;
    if (saved.rotation != null) document.getElementById('f-rotation').value = saved.rotation;
    if (saved.date     != null) document.getElementById('f-date').value     = saved.date;
    if (saved.signature) applySignature(saved.signature);
    if (saved.months) {
      document.querySelectorAll('.month-cb').forEach(cb => {
        cb.checked = saved.months.includes(cb.value);
      });
    }
    updateRateFromMonth();
    if (saved.grid) {
      for (let d = 1; d <= TOTAL_DAYS; d++) {
        for (let t = 1; t <= 9; t++) {
          grid[d][t] = !!(saved.grid[d] && saved.grid[d][t]);
        }
      }
    }
    updateAllIndicators();
    updateP2Subtitle();
    updateSummary();
    saveState();
  };
  reader.readAsText(file);
}

// Drag-and-drop JSON import
document.addEventListener('dragover', function(e) {
  const hasFile = e.dataTransfer.types.includes('Files');
  if (hasFile) e.preventDefault();
});
document.addEventListener('drop', function(e) {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.endsWith('.json') && file.type !== 'application/json') return;
  e.preventDefault();
  importJSON({ files: [file], value: '' });
});

// Month: single-select
document.querySelectorAll('.month-cb').forEach(cb => {
  cb.addEventListener('change', function() {
    pushUndo();
    if (this.checked) {
      document.querySelectorAll('.month-cb').forEach(o => { if (o !== this) o.checked = false; });
    }
    updateRateFromMonth();
    updateP2Subtitle();
    updateSummary();
    saveState();
  });
});

function updateP2Subtitle() {
  const selected = [...document.querySelectorAll('.month-cb:checked')].map(c => c.value)[0];
  const year = '26';
  const name = document.getElementById('f-name').value;
  const sub = document.getElementById('p2-subtitle');
  if (selected || name) {
    sub.textContent = `${name || ''}${selected ? ' — ' + selected + ' 20' + year : ''}`;
  } else {
    sub.textContent = 'University of Michigan Family Medicine Residency Program';
  }
}

// Auto-save on every field input; debounced undo snapshot for text fields
['f-name','f-empid','f-addr','f-rotation','f-date'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => { updateP2Subtitle(); saveState(); pushUndoDebounced(); });
});

// Set today's date only if nothing is saved
const today = new Date();
const todayStr = `${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}/${today.getFullYear()}`;

// Init: load saved state first, then build rows, then save triggers
// ══════════════════════════════════════════════
//  SIGNATURE
// ══════════════════════════════════════════════
let sigMode = 'upload'; // 'upload' | 'draw'

function setSigMode(mode) {
  sigMode = mode;
  document.getElementById('sig-upload-wrap').style.display = mode === 'upload' ? 'block' : 'none';
  document.getElementById('sig-draw-wrap').classList.toggle('visible', mode === 'draw');
  document.getElementById('sig-btn-upload').classList.toggle('active', mode === 'upload');
  document.getElementById('sig-btn-draw').classList.toggle('active', mode === 'draw');
  if (mode === 'draw') initCanvas();
}

function applySignature(dataUrl) {
  const img = document.getElementById('sig-img');
  const placeholder = document.getElementById('sig-placeholder');
  img.src = dataUrl;
  img.style.display = 'block';
  placeholder.style.display = 'none';
}

function clearSignature(e) {
  if (e) { e.stopPropagation(); pushUndo(); }
  const img = document.getElementById('sig-img');
  const placeholder = document.getElementById('sig-placeholder');
  img.src = '';
  img.style.display = 'none';
  placeholder.style.display = 'block';
  document.getElementById('sig-file-input').value = '';
  saveState();
}

document.getElementById('sig-file-input').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxW = 280, maxH = 38;
      const scale = 3;
      let w = img.width, h = img.height;
      const ratio = Math.min(maxW / w, maxH / h, 1);
      const dispW = Math.round(w * ratio);
      const dispH = Math.round(h * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = dispW * scale; canvas.height = dispH * scale;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, dispW * scale, dispH * scale);
      pushUndo();
      applySignature(canvas.toDataURL('image/png'));
      saveState();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ── Canvas drawing ──
let drawCanvas, drawCtx, isDrawing = false, hasStrokes = false, canvasReady = false;
let lastX = 0, lastY = 0;

function initCanvas() {
  if (canvasReady) return;
  drawCanvas = document.getElementById('sig-canvas');
  drawCtx = drawCanvas.getContext('2d');
  // Size the canvas backing store to match its CSS display size
  const rect = drawCanvas.getBoundingClientRect();
  drawCanvas.width  = rect.width  * 2; // 2x for retina
  drawCanvas.height = rect.height * 2;
  drawCtx.scale(2, 2);
  drawCtx.strokeStyle = '#1a1a2e';
  drawCtx.lineWidth = 1.5;
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  canvasReady = true;

  function getPos(e) {
    const r = drawCanvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const p = getPos(e);
    lastX = p.x; lastY = p.y;
    drawCtx.beginPath();
    drawCtx.moveTo(lastX, lastY);
  }

  function draw(e) {
    e.preventDefault();
    if (!isDrawing) return;
    const p = getPos(e);
    drawCtx.lineTo(p.x, p.y);
    drawCtx.stroke();
    lastX = p.x; lastY = p.y;
    hasStrokes = true;
    document.getElementById('sig-canvas-hint').style.display = 'none';
  }

  function endDraw(e) { isDrawing = false; }

  drawCanvas.addEventListener('mousedown',  startDraw);
  drawCanvas.addEventListener('mousemove',  draw);
  drawCanvas.addEventListener('mouseup',    endDraw);
  drawCanvas.addEventListener('mouseleave', endDraw);
  drawCanvas.addEventListener('touchstart', startDraw, { passive: false });
  drawCanvas.addEventListener('touchmove',  draw,      { passive: false });
  drawCanvas.addEventListener('touchend',   endDraw);
}

function clearCanvas() {
  if (!drawCtx) return;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  hasStrokes = false;
  document.getElementById('sig-canvas-hint').style.display = '';
}

function saveDrawnSignature() {
  if (!drawCanvas || !hasStrokes) {
    alert('Please draw your signature first.');
    return;
  }
  // Export at full canvas resolution (already 2x), then switch to upload view to show it
  pushUndo();
  applySignature(drawCanvas.toDataURL('image/png'));
  saveState();
  setSigMode('upload'); // flip back to show the captured signature
}

const hadSaved = loadState();
if (!hadSaved) document.getElementById('f-date').value = todayStr;
updateRateFromMonth();
buildRows();
updateP2Subtitle();
updateUndoRedo();

function newForm() {
  if (!confirm('Start a new form? This will clear all checkboxes and reset all fields.')) return;
  pushUndo();
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  // Reset fields
  document.getElementById('f-name').value = '';
  document.getElementById('f-empid').value = '';
  document.getElementById('f-addr').value = '';
  document.getElementById('f-rotation').value = '';
  document.getElementById('f-date').value = todayStr;
  document.querySelectorAll('.month-cb').forEach(cb => cb.checked = false);
  updateRateFromMonth();
  clearSignature(null);
  clearCanvas();
  setSigMode('upload');
  canvasReady = false;
  // Reset grid
  for (let d = 1; d <= TOTAL_DAYS; d++)
    for (let t = 1; t <= 9; t++) grid[d][t] = false;
  document.querySelectorAll('input[type=checkbox][id^="r"]').forEach(cb => cb.checked = false);
  updateP2Subtitle();
  updateSummary();
}
