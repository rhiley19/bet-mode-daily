const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmtMoney = (v) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtOdds = (v) => v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v) > 0 ? `+${Number(v)}` : String(Number(v));

let resultScreenshotDataUrl = null;
let resultScreenshotFile = null;
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

function filteredResults(rows) {
  const sport = $('#historySportFilter')?.value || 'all';
  const outcome = $('#historyOutcomeFilter')?.value || 'all';
  const type = $('#historyTypeFilter')?.value || 'all';
  return rows.filter(r =>
    (sport === 'all' || r.sport === sport) &&
    (outcome === 'all' || r.outcome === outcome) &&
    (type === 'all' || r.type === type)
  );
}

function renderCurve(rows) {
  const host = $('#resultsCurve');
  if (!host) return;
  if (!rows.length) {
    host.innerHTML = '<div class="curve-empty">Add results to build your bankroll curve.</div>';
    $('#curveEndValue').textContent = fmtMoney(0);
    return;
  }
  const ordered = rows.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)));
  let running = 0;
  const values = [0, ...ordered.map(r => (running += rowProfit(r)))];
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(max - min, 1);
  const w = 700, h = 150, pad = 10;
  const pts = values.map((v,i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x,y,v];
  });
  const path = pts.map((p,i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const zeroY = h - pad - ((0 - min) / range) * (h - pad * 2);
  const last = pts[pts.length - 1];
  host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Cumulative betting profit and loss">
    <line class="curve-zero" x1="${pad}" y1="${zeroY.toFixed(1)}" x2="${w-pad}" y2="${zeroY.toFixed(1)}"></line>
    <path class="curve-path" d="${path}"></path>
    <circle class="curve-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4"></circle>
  </svg>`;
  const endValue = values[values.length - 1];
  $('#curveEndValue').textContent = `${endValue >= 0 ? '+' : ''}${fmtMoney(endValue)}`;
  $('#curveEndValue').className = endValue > 0 ? 'profit' : endValue < 0 ? 'loss' : '';
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

  const shown = filteredResults(rows);
  const filteredPnl = shown.reduce((a,r) => a + rowProfit(r), 0);
  $('#filteredPnl').textContent = `${filteredPnl >= 0 ? '+' : ''}${fmtMoney(filteredPnl)}`;
  $('#filteredPnl').className = filteredPnl > 0 ? 'profit' : filteredPnl < 0 ? 'loss' : '';
  $('#filteredCount').textContent = `${shown.length} wager${shown.length === 1 ? '' : 's'}`;

  const priced = shown.map(r => Number(r.odds)).filter(o => Number.isFinite(o) && o !== 0);
  const implied = priced.map(o => o < 0 ? (-o) / ((-o) + 100) : 100 / (o + 100));
  const avgImplied = implied.length ? implied.reduce((a,b) => a+b,0) / implied.length : null;
  $('#averageOdds').textContent = avgImplied == null ? '—' : `${(avgImplied * 100).toFixed(1)}%`;

  const sportMap = new Map();
  rows.forEach(r => {
    const key = r.sport || 'Other';
    const prev = sportMap.get(key) || { pnl:0, count:0 };
    prev.pnl += rowProfit(r);
    prev.count += 1;
    sportMap.set(key, prev);
  });
  const best = [...sportMap.entries()].sort((a,b) => b[1].pnl - a[1].pnl)[0];
  $('#bestSport').textContent = best ? best[0] : '—';
  $('#bestSportNote').textContent = best ? `${best[1].pnl >= 0 ? '+' : ''}${fmtMoney(best[1].pnl)} · ${best[1].count} bet${best[1].count === 1 ? '' : 's'}` : 'Needs history';

  const straights = rows.filter(r => r.type === 'Straight');
  const straightStake = straights.reduce((a,r)=>a+Number(r.stake||0),0);
  const straightPnl = straights.reduce((a,r)=>a+rowProfit(r),0);
  const straightRoi = straightStake ? straightPnl / straightStake : null;
  $('#straightRoi').textContent = straightRoi == null ? '—' : `${straightRoi >= 0 ? '+' : ''}${(straightRoi*100).toFixed(1)}%`;
  $('#straightRoi').className = straightRoi > 0 ? 'profit' : straightRoi < 0 ? 'loss' : '';

  renderCurve(shown);

  wrap.innerHTML = shown.length ? `<table class="history-table"><thead><tr><th>Date</th><th>Bet</th><th>Stake</th><th>Odds</th><th>Result</th><th>P/L</th><th></th></tr></thead><tbody>${shown.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(r => {
    const p = rowProfit(r);
    return `<tr><td>${esc(r.date)}</td><td><b>${esc(r.bet)}${r.source === 'screenshot' ? '<span class="screenshot-source">IMG</span>' : ''}</b><small>${esc(r.sport)} · ${esc(r.type)}</small></td><td>${fmtMoney(r.stake)}</td><td>${fmtOdds(r.odds)}</td><td><span class="result-pill ${esc(r.outcome)}">${esc(String(r.outcome || '').toUpperCase())}</span></td><td class="${p > 0 ? 'profit' : p < 0 ? 'loss' : ''}">${p >= 0 ? '+' : ''}${fmtMoney(p)}</td><td><button class="delete-result" data-id="${esc(r.id)}" aria-label="Delete result">×</button></td></tr>`;
  }).join('')}</tbody></table>` : '<div class="no-history">No wagers match these filters.</div>';

  $$('.delete-result').forEach(btn => btn.addEventListener('click', () => {
    saveResults(loadResults().filter(r => r.id !== btn.dataset.id));
    renderResultsEnhanced();
  }));
}

function exportResultsCsv() {
  const rows = filteredResults(loadResults());
  if (!rows.length) return;
  const cols = ['date','sport','bet','stake','odds','outcome','type','actualProfit','source'];
  const csv = [cols.join(','), ...rows.map(r => cols.map(k => {
    const val = r[k] ?? '';
    return `"${String(val).replaceAll('"','""')}"`;
  }).join(','))].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bet-mode-results-${todayToronto()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

['#historySportFilter','#historyOutcomeFilter','#historyTypeFilter'].forEach(sel => $(sel)?.addEventListener('change', renderResultsEnhanced));

$('#exportResultsBtn')?.addEventListener('click', exportResultsCsv);

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
  return ['MLB','NFL','NHL','NBA','Soccer','Other'].map(x => `<option ${x === value ? 'selected' : ''}>${x}</option>`).join('');
}
function typeOptions(value) {
  return ['Straight','Conservative parlay','Balanced parlay','Long shot','Live bet'].map(x => `<option ${x === value ? 'selected' : ''}>${x}</option>`).join('');
}
function outcomeOptions(value) {
  return [['review','Review required'],['win','Win'],['loss','Loss'],['push','Push']].map(([v,l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('');
}

function normalizeImportedBet(raw = {}) {
  return {
    selected: true,
    date: raw.date || todayToronto(),
    sport: ['MLB','NFL','NHL','NBA','Soccer','Other'].includes(raw.sport) ? raw.sport : 'Other',
    bet: raw.bet || '',
    stake: raw.stake !== null && raw.stake !== undefined && raw.stake !== '' && Number.isFinite(Number(raw.stake)) ? Number(raw.stake) : '',
    odds: raw.odds !== null && raw.odds !== undefined && raw.odds !== '' && Number.isFinite(Number(raw.odds)) ? Number(raw.odds) : '',
    outcome: ['win','loss','push'].includes(raw.outcome) ? raw.outcome : 'review',
    type: ['Straight','Conservative parlay','Balanced parlay','Long shot','Live bet'].includes(raw.type) ? raw.type : 'Straight',
    actualProfit: raw.actualProfit !== null && raw.actualProfit !== undefined && raw.actualProfit !== '' && Number.isFinite(Number(raw.actualProfit)) ? Number(raw.actualProfit) : null,
    confidence: Number.isFinite(Number(raw.confidence)) ? Math.round(Number(raw.confidence)) : null,
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields : []
  };
}

function resetImporter() {
  resultScreenshotDataUrl = null;
  resultScreenshotFile = null;
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
    const bad = selected.find(r => !r.date || !r.bet || r.outcome === 'review' || !Number.isFinite(Number(r.stake)) || Number(r.stake) <= 0 || (r.odds == null && r.actualProfit == null));
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


function parseMoneyValue(line) {
  const m = String(line || '').match(/\$\s*([0-9]+(?:[.,][0-9]{2})?)/);
  return m ? Number(m[1].replace(',','.')) : null;
}
function parseOcrDate(text) {
  const iso = text.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,'0')}-${String(iso[3]).padStart(2,'0')}`;
  const us = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
  if (us) return `${us[3]}-${String(us[1]).padStart(2,'0')}-${String(us[2]).padStart(2,'0')}`;
  const named = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,|\s)\s*(20\d{2})/i);
  if (named) {
    const d = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return null;
}
function detectSportFromText(text) {
  const t = text.toUpperCase();
  if (/\bMLB\b|BASEBALL/.test(t)) return 'MLB';
  if (/\bNFL\b|TOUCHDOWN|PASSING YARDS|RUSHING YARDS/.test(t)) return 'NFL';
  if (/\bNHL\b|HOCKEY|SHOTS ON GOAL/.test(t)) return 'NHL';
  if (/\bNBA\b|BASKETBALL|THREES|REBOUNDS/.test(t)) return 'NBA';
  if (/SOCCER|PREMIER LEAGUE|LA LIGA|CHAMPIONS LEAGUE|GOALS?/.test(t)) return 'Soccer';
  return 'Other';
}
function parseOcrBetBlock(text, ocrConfidence) {
  const lines = text.split(/\n+/).map(x => x.replace(/\s+/g,' ').trim()).filter(Boolean);
  const lower = text.toLowerCase();
  const outcome = /\b(lost|loss|losing)\b/.test(lower) ? 'loss' : /\b(push|void|refunded|refund)\b/.test(lower) ? 'push' : /\b(won|win|winner|settled.*won)\b/.test(lower) ? 'win' : 'review';
  let stake = null, payout = null;
  for (const line of lines) {
    if (stake == null && /(wager|stake|bet amount|amount wagered)/i.test(line)) stake = parseMoneyValue(line);
    if (payout == null && /(payout|return|returns|paid|total payout)/i.test(line) && !/potential/i.test(line)) payout = parseMoneyValue(line);
  }
  const oddsMatches = [...text.matchAll(/(^|\s)([+-]\d{3,4})\b/g)].map(m => Number(m[2])).filter(Number.isFinite);
  const odds = oddsMatches.length ? oddsMatches[oddsMatches.length - 1] : null;
  const date = parseOcrDate(text);
  const type = /(parlay|same game parlay|sgp|\d+[- ]leg)/i.test(text) ? 'Balanced parlay' : /live bet|live wager/i.test(text) ? 'Live bet' : 'Straight';
  const ignore = /(fanduel|sportsbook|settled|won|lost|loss|payout|return|returns|wager|stake|bet amount|cash out|potential|odds|bet id|receipt|share bet)/i;
  const useful = lines.filter(l => l.length > 3 && !ignore.test(l) && !/^\$?[\d,.]+$/.test(l)).slice(0, 6);
  const bet = useful.join(' · ').slice(0, 420) || (type === 'Straight' ? 'Review wager description' : 'Review parlay legs');
  let actualProfit = null;
  if (outcome === 'loss' && stake != null) actualProfit = -stake;
  else if (outcome === 'push') actualProfit = 0;
  else if (outcome === 'win' && payout != null && stake != null) actualProfit = payout - stake;
  const uncertainFields = [];
  if (!date) uncertainFields.push('date');
  if (outcome === 'review') uncertainFields.push('result');
  if (stake == null) uncertainFields.push('stake');
  if (odds == null && actualProfit == null) uncertainFields.push('odds');
  if (!useful.length) uncertainFields.push('bet');
  const requiredScore = [date, stake != null, odds != null || actualProfit != null, useful.length > 0].filter(Boolean).length;
  const confidence = Math.round(Math.max(0, Math.min(100, (Number(ocrConfidence || 0) * .65) + (requiredScore/4*35))));
  return normalizeImportedBet({ date, sport:detectSportFromText(text), bet, stake, odds, outcome, type, actualProfit, confidence, uncertainFields });
}
function splitOcrIntoBetBlocks(text) {
  const lines = String(text || '').split(/\n+/);
  const starts = [];
  lines.forEach((l,i) => { if (/^(wager|stake|bet amount|bet id|settled bet)/i.test(l.trim())) starts.push(i); });
  if (starts.length < 2) return [text];
  const blocks = [];
  for (let i=0;i<starts.length;i++) {
    const from = Math.max(0, starts[i]-5);
    const to = i+1 < starts.length ? Math.max(from+1, starts[i+1]-2) : lines.length;
    const block = lines.slice(from,to).join('\n').trim();
    if (block.length > 20) blocks.push(block);
  }
  return blocks.length ? blocks.slice(0,12) : [text];
}
async function readResultWithAI() {
  $('#resultImportError')?.classList.add('hidden');
  $('#resultImportLoading')?.classList.remove('hidden');
  if ($('#resultImportLoadingText')) $('#resultImportLoadingText').textContent = 'Using the low-cost AI fallback to read the screenshot…';
  try {
    const res = await fetch('/.netlify/functions/result-import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ screenshotDataUrl: resultScreenshotDataUrl }) });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not read the screenshot with AI.');
    importedResultDraft = (data.bets || []).slice(0,12).map(normalizeImportedBet);
    renderDraft(`${data.notes || ''}${data.notes ? ' ' : ''}AI fallback used. Review before saving.`);
  } catch (e) { showImportError(e.message); }
  finally {
    $('#resultImportLoading')?.classList.add('hidden');
    $('#readResultImageBtn').disabled = false;
    if ($('#resultImportLoadingText')) $('#resultImportLoadingText').textContent = 'Reading the screenshot locally…';
  }
}
async function readResultLocally() {
  if (!window.Tesseract) throw new Error('Free OCR did not load. Reload the page or use the AI fallback.');
  if ($('#resultImportLoadingText')) $('#resultImportLoadingText').textContent = 'Free local OCR is reading the screenshot…';
  const worker = await window.Tesseract.createWorker('eng');
  try {
    const out = await worker.recognize(resultScreenshotFile || resultScreenshotDataUrl);
    const text = String(out?.data?.text || '').trim();
    const confidence = Number(out?.data?.confidence || 0);
    if (!text) throw new Error('Local OCR could not find readable text.');
    importedResultDraft = splitOcrIntoBetBlocks(text).map(parseText => parseOcrBetBlock(parseText, confidence));
    const uncertain = importedResultDraft.some(x => Number(x.confidence || 0) < 75 || x.uncertainFields.length);
    renderDraft(`Free local OCR · ${Math.round(confidence)}% text confidence. ${uncertain ? 'Some fields need review. AI fallback is available below if you want a second read.' : 'The main fields were read locally with no paid AI call.'}`);
    const tools = document.createElement('div');
    tools.className = 'ocr-tools';
    tools.innerHTML = `<span class="ocr-free">✓ $0 OCR COMPLETE</span>${uncertain ? '<button id="aiFallbackBtn" class="ghost" type="button">Try AI fallback</button><span class="ocr-ai">Uses a small OpenAI API call</span>' : ''}<details class="ocr-raw"><summary>View raw OCR text</summary><pre>${esc(text)}</pre></details>`;
    $('#resultImportDraft')?.prepend(tools);
    $('#aiFallbackBtn')?.addEventListener('click', readResultWithAI);
  } finally {
    await worker.terminate();
  }
}

$('#resultImage')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  resultScreenshotFile = file;
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
    await readResultLocally();
  } catch (e) {
    const box = $('#resultImportError');
    if (box) {
      box.innerHTML = `${esc(e.message)} <button id="ocrFailAiBtn" class="ghost" type="button">Use AI fallback</button>`;
      box.classList.remove('hidden');
      $('#ocrFailAiBtn')?.addEventListener('click', readResultWithAI);
    }
  } finally {
    $('#resultImportLoading')?.classList.add('hidden');
    $('#readResultImageBtn').disabled = false;
    if ($('#resultImportLoadingText')) $('#resultImportLoadingText').textContent = 'Reading the screenshot locally…';
  }
});

$('#resultForm')?.addEventListener('submit', () => setTimeout(renderResultsEnhanced, 0));
$('#clearResultsBtn')?.addEventListener('click', () => setTimeout(renderResultsEnhanced, 0));
setTimeout(renderResultsEnhanced, 0);
