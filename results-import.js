const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmtMoney = (v) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtOdds = (v) => v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v) > 0 ? `+${Number(v)}` : String(Number(v));

let resultScreenshotDataUrl = null;
let importedResultDraft = [];

const style = document.createElement('style');
style.textContent = `
.result-import-panel{margin:0 0 22px}.result-import-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}.result-import-head h3{margin:5px 0 7px}.result-import-head p{margin:0;color:var(--muted,#96a09a);max-width:800px;line-height:1.55}.result-import-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(0,1.6fr);gap:18px}.compact-upload{min-height:190px}.import-draft{border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:18px;background:rgba(255,255,255,.025);min-height:190px}.empty-import{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted,#96a09a);gap:7px}.empty-import b{color:var(--text,#f4f7f5)}.import-empty-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);color:#77f6b5;font-weight:800}.import-draft-head,.import-bet-top,.import-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}.import-draft-head h4{margin:4px 0 0;font-size:18px}.import-note{margin:14px 0;padding:11px 13px;border-radius:12px;background:rgba(255,186,74,.08);border:1px solid rgba(255,186,74,.18);font-size:13px;line-height:1.5}.import-bets{display:grid;gap:12px;margin-top:14px}.import-bet{border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;background:rgba(4,9,7,.28)}.import-select{display:flex;gap:8px;align-items:center;font-size:12px;font-weight:800;letter-spacing:.06em}.import-select input{accent-color:#70f2ad}.import-form-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.import-form-grid label{display:flex;flex-direction:column;gap:6px}.import-form-grid label.wide{grid-column:span 2}.import-form-grid label span{font-size:10px;letter-spacing:.08em;color:var(--muted,#96a09a);font-weight:700;text-transform:uppercase}.import-form-grid input,.import-form-grid select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:inherit;padding:10px}.uncertain-line{font-size:12px;color:#ffcb78;margin-top:10px}.import-actions{justify-content:flex-end;margin-top:14px}.save-imported{min-width:180px}.mini-loading{display:flex;align-items:center;gap:10px;margin-top:12px;color:var(--muted,#96a09a);font-size:13px}.mini-loading .spinner{width:18px;height:18px}.screenshot-source{display:inline-block;margin-left:6px;font-size:9px;padding:2px 6px;border-radius:999px;border:1px solid rgba(112,242,173,.25);color:#77f6b5;vertical-align:middle}
@media(max-width:900px){.result-import-grid{grid-template-columns:1fr}.import-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.result-import-head{flex-direction:column}.import-form-grid{grid-template-columns:1fr}.import-form-grid label.wide{grid-column:auto}.import-actions{flex-direction:column}.import-actions button{width:100%}}
`;
document.head.appendChild(style);

function loadResults() {
  try { return JSON.parse(localStorage.getItem('betmode:results') || '[]'); } catch { return []; }
}
function saveResults(rows) { localStorage.setItem('betmode:results', JSON.stringify(rows)); }

function americanProfit(stake, odds, outcome) {
  const s = Number(stake || 0);
  if (outcome === 'push') return 0;
  if (outcome === 'loss') return -s;
  const o = Number(odds);
  if (!Number.isFinite(o) || o === 0) return 0;
  return o > 0 ? s * (o / 100) : s * (100 / Math.abs(o));
}
function rowProfit(r) {
  if (r.actualProfit !== null && r.actualProfit !== undefined && Number.isFinite(Number(r.actualProfit))) return Number(r.actualProfit);
  return americanProfit(r.stake, r.odds, r.outcome);
}

function renderResultsEnhanced() {
  const stats = $('#resultsStats');
  const wrap = $('#resultsTableWrap');
  if (!stats || !wrap) return;
  const rows = loadResults();
  const totalStake = rows.reduce((a,r) => a + Number(r.stake || 0), 0);
  const pnl = rows.reduce((a,r) => a + rowProfit(r), 0);
  const wins = rows.filter(r => r.outcome === 'win').length;
  const losses = rows.filter(r => r.outcome === 'loss').length;
  const decisions = wins + losses;
  const roi = totalStake ? pnl / totalStake : 0;
  const winRate = decisions ? wins / decisions : 0;

  stats.innerHTML = `
    <article><span>NET P/L</span><b class="${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}</b></article>
    <article><span>ROI</span><b class="${roi > 0 ? 'profit' : roi < 0 ? 'loss' : ''}">${roi >= 0 ? '+' : ''}${(roi*100).toFixed(1)}%</b></article>
    <article><span>WIN RATE</span><b>${(winRate*100).toFixed(1)}%</b></article>
    <article><span>WAGERS</span><b>${rows.length}</b></article>`;

  wrap.innerHTML = rows.length ? `<table class="history-table"><thead><tr><th>Date</th><th>Bet</th><th>Stake</th><th>Odds</th><th>Result</th><th>P/L</th><th></th></tr></thead><tbody>${rows.slice().reverse().map(r => {
    const p = rowProfit(r);
    return `<tr><td>${esc(r.date)}</td><td><b>${esc(r.bet)}${r.source === 'screenshot' ? '<span class="screenshot-source">IMG</span>' : ''}</b><small>${esc(r.sport)} · ${esc(r.type)}</small></td><td>${fmtMoney(r.stake)}</td><td>${fmtOdds(r.odds)}</td><td><span class="result-pill ${esc(r.outcome)}">${esc(String(r.outcome || '').toUpperCase())}</span></td><td class="${p > 0 ? 'profit' : p < 0 ? 'loss' : ''}">${p >= 0 ? '+' : ''}${fmtMoney(p)}</td><td><button class="delete-result" data-id="${esc(r.id)}" aria-label="Delete result">×</button></td></tr>`;
  }).join('')}</tbody></table>` : '<div class="no-history">No results saved yet. Add one manually or upload a settled-bet screenshot.</div>';

  $$('.delete-result').forEach(btn => btn.addEventListener('click', () => {
    saveResults(loadResults().filter(r => r.id !== btn.dataset.id));
    renderResultsEnhanced();
  }));
}

async function compressImage(file) {
  if (!file?.type?.match(/^image\/(png|jpeg|webp)$/)) throw new Error('Use a PNG, JPG or WebP screenshot.');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = data;
  });
  const max = 1600;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

function todayToronto() {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}
function sportOptions(value) {
  return ['MLB','NFL','NHL','NBA','Soccer'].map(x => `<option ${x === value ? 'selected' : ''}>${x}</option>`).join('');
}
function typeOptions(value) {
  return ['Straight','Conservative parlay','Balanced parlay','Long shot','Live bet'].map(x => `<option ${x === value ? 'selected' : ''}>${x}</option>`).join('');
}
function outcomeOptions(value) {
  return [['win','Win'],['loss','Loss'],['push','Push']].map(([v,l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('');
}

function normalizeImportedBet(raw = {}) {
  return {
    selected: true,
    date: raw.date || todayToronto(),
    sport: ['MLB','NFL','NHL','NBA','Soccer'].includes(raw.sport) ? raw.sport : 'MLB',
    bet: raw.bet || '',
    stake: Number.isFinite(Number(raw.stake)) ? Number(raw.stake) : '',
    odds: Number.isFinite(Number(raw.odds)) ? Number(raw.odds) : '',
    outcome: ['win','loss','push'].includes(raw.outcome) ? raw.outcome : 'win',
    type: ['Straight','Conservative parlay','Balanced parlay','Long shot','Live bet'].includes(raw.type) ? raw.type : 'Straight',
    actualProfit: Number.isFinite(Number(raw.actualProfit)) ? Number(raw.actualProfit) : null,
    confidence: Number.isFinite(Number(raw.confidence)) ? Math.round(Number(raw.confidence)) : null,
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields : []
  };
}

function resetImporter() {
  resultScreenshotDataUrl = null;
  importedResultDraft = [];
  if ($('#resultImage')) $('#resultImage').value = '';
  if ($('#resultImagePreview')) { $('#resultImagePreview').src = ''; $('#resultImagePreview').classList.add('hidden'); }
  $('#resultUploadPrompt')?.classList.remove('hidden');
  $('#resultUploadZone')?.classList.remove('has-image');
  $('#resultImportError')?.classList.add('hidden');
  if ($('#resultImportDraft')) {
    $('#resultImportDraft').className = 'import-draft empty-import';
    $('#resultImportDraft').innerHTML = '<div class="import-empty-icon">↗</div><b>Your extracted bets will appear here</b><span>Nothing is added to Results until you review and save it.</span>';
  }
}

function syncDraft() {
  importedResultDraft = importedResultDraft.map((row, i) => ({
    ...row,
    selected: $(`.import-select-box[data-index="${i}"]`)?.checked ?? row.selected,
    date: $(`.import-date[data-index="${i}"]`)?.value || row.date,
    sport: $(`.import-sport[data-index="${i}"]`)?.value || row.sport,
    bet: $(`.import-bet-name[data-index="${i}"]`)?.value.trim() || '',
    stake: Number($(`.import-stake[data-index="${i}"]`)?.value),
    odds: (() => { const v = $(`.import-odds[data-index="${i}"]`)?.value; return v === '' ? null : Number(v); })(),
    outcome: $(`.import-outcome[data-index="${i}"]`)?.value || row.outcome,
    type: $(`.import-type[data-index="${i}"]`)?.value || row.type,
    actualProfit: (() => { const v = $(`.import-profit[data-index="${i}"]`)?.value; return v === '' || v == null ? null : Number(v); })()
  }));
}

function renderDraft(notes = '') {
  const wrap = $('#resultImportDraft');
  if (!wrap) return;
  wrap.className = 'import-draft';
  if (!importedResultDraft.length) {
    wrap.className = 'import-draft empty-import';
    wrap.innerHTML = '<div class="import-empty-icon">!</div><b>No settled bet could be read</b><span>Try a clearer screenshot that shows the wager details and result.</span>';
    return;
  }
  wrap.innerHTML = `
    <div class="import-draft-head"><div><div class="eyebrow">EXTRACTED DRAFT</div><h4>${importedResultDraft.length} bet${importedResultDraft.length === 1 ? '' : 's'} found</h4></div><span class="badge">Editable</span></div>
    ${notes ? `<div class="import-note">${esc(notes)}</div>` : ''}
    <div class="import-bets">${importedResultDraft.map((b,i) => `<article class="import-bet">
      <div class="import-bet-top"><label class="import-select"><input class="import-select-box" data-index="${i}" type="checkbox" ${b.selected ? 'checked' : ''}> SAVE BET ${i+1}</label><span class="confidence-pill">${b.confidence == null ? 'Review' : `${b.confidence}% read confidence`}</span></div>
      <div class="import-form-grid">
        <label><span>Date</span><input class="import-date" data-index="${i}" type="date" value="${esc(b.date)}"></label>
        <label><span>Sport</span><select class="import-sport" data-index="${i}">${sportOptions(b.sport)}</select></label>
        <label><span>Type</span><select class="import-type" data-index="${i}">${typeOptions(b.type)}</select></label>
        <label class="wide"><span>Bet / slip</span><input class="import-bet-name" data-index="${i}" type="text" value="${esc(b.bet)}" placeholder="Describe the wager"></label>
        <label><span>Stake (CAD)</span><input class="import-stake" data-index="${i}" type="number" min="0" step="0.01" value="${esc(b.stake)}"></label>
        <label><span>American odds</span><input class="import-odds" data-index="${i}" type="number" step="1" value="${esc(b.odds)}" placeholder="-110"></label>
        <label><span>Result</span><select class="import-outcome" data-index="${i}">${outcomeOptions(b.outcome)}</select></label>
        <label><span>Actual P/L (optional)</span><input class="import-profit" data-index="${i}" type="number" step="0.01" value="${b.actualProfit == null ? '' : esc(b.actualProfit)}" placeholder="Auto-calculate"></label>
      </div>
      ${b.uncertainFields.length ? `<div class="uncertain-line">Check these fields: ${b.uncertainFields.map(esc).join(', ')}</div>` : ''}
    </article>`).join('')}</div>
    <div class="import-actions"><button id="discardImportedBtn" class="ghost" type="button">Discard</button><button id="saveImportedBtn" class="primary save-imported" type="button">Save selected results</button></div>`;

  $('#discardImportedBtn')?.addEventListener('click', resetImporter);
  $('#saveImportedBtn')?.addEventListener('click', () => {
    syncDraft();
    const selected = importedResultDraft.filter(r => r.selected);
    const bad = selected.find(r => !r.date || !r.bet || !Number.isFinite(Number(r.stake)) || Number(r.stake) <= 0 || (r.odds == null && r.actualProfit == null));
    if (!selected.length) return showImportError('Select at least one extracted bet to save.');
    if (bad) return showImportError('Review the selected bets. Each needs a date, bet description, stake, and either American odds or an actual P/L value.');
    const rows = loadResults();
    for (const r of selected) rows.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      date:r.date, sport:r.sport, bet:r.bet, stake:Number(r.stake), odds:r.odds == null ? null : Number(r.odds), outcome:r.outcome, type:r.type,
      actualProfit:r.actualProfit == null ? null : Number(r.actualProfit), source:'screenshot'
    });
    saveResults(rows);
    renderResultsEnhanced();
    resetImporter();
  });
}
function showImportError(message) {
  const box = $('#resultImportError');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('hidden');
}

$('#resultImage')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $('#resultImportError')?.classList.add('hidden');
  try {
    resultScreenshotDataUrl = await compressImage(file);
    $('#resultImagePreview').src = resultScreenshotDataUrl;
    $('#resultImagePreview').classList.remove('hidden');
    $('#resultUploadPrompt').classList.add('hidden');
    $('#resultUploadZone').classList.add('has-image');
  } catch (e) { showImportError(e.message); }
});
$('#clearResultImageBtn')?.addEventListener('click', resetImporter);
$('#readResultImageBtn')?.addEventListener('click', async () => {
  if (!resultScreenshotDataUrl) return showImportError('Upload a settled-bet screenshot first.');
  $('#resultImportError')?.classList.add('hidden');
  $('#resultImportLoading')?.classList.remove('hidden');
  $('#readResultImageBtn').disabled = true;
  try {
    const res = await fetch('/.netlify/functions/result-import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ screenshotDataUrl: resultScreenshotDataUrl }) });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not read the screenshot.');
    importedResultDraft = (data.bets || []).slice(0,12).map(normalizeImportedBet);
    renderDraft(data.notes || '');
  } catch (e) { showImportError(e.message); }
  finally { $('#resultImportLoading')?.classList.add('hidden'); $('#readResultImageBtn').disabled = false; }
});

$('#resultForm')?.addEventListener('submit', () => setTimeout(renderResultsEnhanced, 0));
$('#clearResultsBtn')?.addEventListener('click', () => setTimeout(renderResultsEnhanced, 0));
setTimeout(renderResultsEnhanced, 0);
