const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let sport = localStorage.getItem("betmode:sport") || "MLB";
let lastCard = null;
let screenshotDataUrl = null;
let healthState = null;
const CARD_CACHE_MS = 30 * 60 * 1000;

const fmtPct = (v) => v == null || Number.isNaN(Number(v)) ? "—" : `${(Number(v) * 100).toFixed(1)}%`;
const fmtMoney = (v) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(Number(v || 0));
const fmtOdds = (v) => v == null || v === "unknown" ? "—" : Number(v) > 0 ? `+${v}` : String(v);
const esc = (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const prettyTime = (iso) => {
  if (!iso) return "Not provided";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }).format(d);
};

function betName(m) {
  if (!m) return "PASS";
  const point = m.point == null ? "" : ` ${Number(m.point) > 0 ? "+" : ""}${m.point}`;
  if (m.participant) {
    if (/scorer/i.test(m.marketLabel || "")) return `${m.participant} · ${m.marketLabel}`;
    return `${m.participant} · ${m.outcome}${point} ${m.marketLabel || ""}`.trim();
  }
  if (m.market === "h2h") return `${m.outcome} ML`;
  if (m.market === "spreads") return `${m.outcome} ${point.trim()}`;
  if (m.market === "totals") return `${m.outcome} ${point.trim()} · Total`;
  return `${m.outcome}${point} · ${m.marketLabel || m.market}`;
}

function setView(view) {
  $$('.view').forEach((el) => el.classList.add('hidden'));
  $(`#${view}View`)?.classList.remove('hidden');
  $$('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.viewTarget === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-view-target]').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.viewTarget)));

function syncSportButtons() {
  $$('.sport').forEach((x) => x.classList.toggle('active', x.dataset.sport === sport));
}

$('.sport').forEach(btn => btn.addEventListener('click', () => {
  sport = btn.dataset.sport;
  localStorage.setItem("betmode:sport", sport);
  syncSportButtons();
  restoreCachedCard();
}));
syncSportButtons();

$('#budget').value = localStorage.getItem('betmode:budget') || '50';
$('#riskProfile').value = localStorage.getItem('betmode:risk') || 'balanced';
$('#budget').addEventListener('change', () => localStorage.setItem('betmode:budget', $('#budget').value));
$('#riskProfile').addEventListener('change', () => {
  localStorage.setItem('betmode:risk', $('#riskProfile').value);
  if (lastCard) renderStakePlan(lastCard);
});
$('#researchMode').value = localStorage.getItem('betmode:researchMode') || 'quick';
$('#researchMode').addEventListener('change', () => localStorage.setItem('betmode:researchMode', $('#researchMode').value));
$('#lowCreditMode').checked = localStorage.getItem('betmode:lowCreditMode') === 'true';
function syncSaverToggle() { $('#lowCreditMode').closest('.saver-toggle')?.classList.toggle('active', $('#lowCreditMode').checked); }
$('#lowCreditMode').addEventListener('change', () => {
  localStorage.setItem('betmode:lowCreditMode', String($('#lowCreditMode').checked));
  syncSaverToggle();
  updateQuotaUI(loadQuota());
});
syncSaverToggle();

function cacheKey() { return `betmode:card:${sport}:${$('#lowCreditMode').checked ? 'low' : 'full'}:${$('#researchMode').value}`; }
function loadCachedCard() {
  try {
    const row = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    return row && row.card ? row : null;
  } catch { return null; }
}
function saveCachedCard(card) { localStorage.setItem(cacheKey(), JSON.stringify({ savedAt: Date.now(), card })); }
function loadQuota() { try { return JSON.parse(localStorage.getItem('betmode:oddsQuota') || 'null'); } catch { return null; } }
function saveQuota(quota) { if (quota) localStorage.setItem('betmode:oddsQuota', JSON.stringify({ ...quota, savedAt: Date.now() })); }
function updateQuotaUI(quota) {
  const remaining = Number(quota?.remaining);
  const used = Number(quota?.used);
  const total = Number.isFinite(remaining) && Number.isFinite(used) ? remaining + used : null;
  const pct = total && total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  $('#quotaHeadline').textContent = Number.isFinite(remaining) ? `${remaining} odds credits remaining` : 'Credits unknown';
  $('#quotaDetail').textContent = Number.isFinite(remaining) ? `Last request cost ${quota?.last ?? '—'} · ${used || 0} used this cycle${$('#lowCreditMode').checked ? ' · Low Credit Mode ON' : ''}` : 'Generate once to read the provider balance. Cached cards do not spend credits.';
  $('#quotaBar').style.width = `${pct}%`;
  $('#quotaBar').classList.toggle('low', Number.isFinite(remaining) && remaining <= 50);
  if (Number.isFinite(remaining) && remaining <= 50 && !$('#lowCreditMode').checked) {
    $('#lowCreditMode').checked = true;
    localStorage.setItem('betmode:lowCreditMode','true');
    syncSaverToggle();
  }
}
function restoreCachedCard() {
  const row = loadCachedCard();
  if (!row) {
    $('#cacheBadge').textContent = 'NO CACHE';
    $('#cacheDetail').textContent = 'Generate once to save this mode';
    return false;
  }
  const age = Date.now() - Number(row.savedAt || 0);
  render(row.card, { cached: true, cacheAgeMs: age });
  $('#cacheBadge').textContent = age <= CARD_CACHE_MS ? 'CACHE FRESH' : 'CACHE STALE';
  $('#cacheDetail').textContent = `${Math.max(1, Math.round(age/60000))} min old · no credits spent`;
  return true;
}
updateQuotaUI(loadQuota());

$('#statusPill').addEventListener('click', () => {
  const panel = $('#setupPanel');
  const open = panel.classList.toggle('hidden') === false;
  $('#statusPill').setAttribute('aria-expanded', String(open));
});

async function health() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    healthState = d;
    const ready = d.oddsApiConfigured && d.openAiConfigured;
    $('#statusText').textContent = ready ? 'Research engine connected' : 'Setup required';
    $('#statusDot').classList.toggle('warn-dot', !ready);
    $('#setupDetails').innerHTML = `
      <span class="setup-chip ${d.oddsApiConfigured ? 'ok' : 'bad'}">Odds API ${d.oddsApiConfigured ? '✓' : '×'}</span>
      <span class="setup-chip ${d.openAiConfigured ? 'ok' : 'bad'}">OpenAI ${d.openAiConfigured ? '✓' : '×'}</span>
      <span class="setup-chip">Props ${d.propMode ? 'ON' : 'OFF'}</span>`;
    return ready;
  } catch {
    $('#statusText').textContent = 'Local preview';
    $('#statusDot').classList.add('warn-dot');
    return false;
  }
}

function rankCard(label, m, accent = '') {
  const confidence = m?.confidence != null ? `${Number(m.confidence).toFixed(1)}/10` : '—';
  const edge = m?.edge != null ? fmtPct(m.edge) : '—';
  return `<article class="rank-card ${accent}">
    <div class="rank-label">${label}</div>
    <h3>${esc(m ? betName(m) : 'PASS')}</h3>
    <div class="rank-bottom">
      <div><span>PRICE</span><b class="odds">${m ? fmtOdds(m.odds) : '—'}</b></div>
      <div><span>EDGE</span><b>${edge}</b></div>
      <div><span>CONF.</span><b>${confidence}</b></div>
    </div>
    ${m ? `<div class="book-line">${esc(m.bookmaker || 'Reference book')}</div>` : '<div class="book-line">No wager cleared the filter</div>'}
  </article>`;
}

function parlayDecimal(legs) {
  if (!legs?.length) return null;
  const decimal = legs.reduce((acc, leg) => {
    const o = Number(leg.odds);
    if (!Number.isFinite(o)) return acc;
    const d = o > 0 ? 1 + (o / 100) : 1 + (100 / Math.abs(o));
    return acc * d;
  }, 1);
  return decimal;
}

function decimalToAmerican(d) {
  if (!d || d <= 1) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

function renderStakePlan(card) {
  const budget = Math.max(Number($('#budget').value || 0), 0);
  localStorage.setItem('betmode:budget', String(budget));
  const profile = $('#riskProfile').value;
  const weights = {
    conservative: { s1:.42, s2:.23, s3:.12, cp:.10, bp:.05, lp:0 },
    balanced: { s1:.36, s2:.20, s3:.10, cp:.14, bp:.10, lp:.04 },
    aggressive: { s1:.30, s2:.17, s3:.08, cp:.14, bp:.14, lp:.10 }
  }[profile];

  const rows = [];
  const picks = card.topThree || [];
  const add = (label, bet, weight, type) => {
    if (!bet || weight <= 0) return;
    rows.push({ label, bet, amount: budget * weight, type });
  };
  add('Straight #1', picks[0], weights.s1, 'straight');
  add('Straight #2', picks[1], weights.s2, 'straight');
  add('Straight #3', picks[2], weights.s3, 'straight');
  if (card.parlays?.conservative?.length) rows.push({ label:'Conservative parlay', bet: card.parlays.conservative, amount: budget * weights.cp, type:'parlay' });
  if (card.parlays?.balanced?.length) rows.push({ label:'Balanced parlay', bet: card.parlays.balanced, amount: budget * weights.bp, type:'parlay' });
  if (card.parlays?.longShot?.length) rows.push({ label:'Long shot', bet: card.parlays.longShot, amount: budget * weights.lp, type:'parlay' });

  const used = rows.reduce((a,r) => a + r.amount, 0);
  const unbet = Math.max(budget - used, 0);
  $('#stakeTitle').textContent = `${profile.charAt(0).toUpperCase() + profile.slice(1)} allocation`;
  $('#stakeTotal').textContent = fmtMoney(budget);
  $('#stakeRows').innerHTML = rows.map(r => {
    const name = r.type === 'parlay' ? r.bet.map(betName).join(' + ') : betName(r.bet);
    return `<div class="stake-row"><div><span>${esc(r.label)}</span><b>${esc(name)}</b></div><strong>${fmtMoney(r.amount)}</strong></div>`;
  }).join('') + `<div class="stake-row unbet"><div><span>Unbet cash</span><b>Keep available unless a better price appears</b></div><strong>${fmtMoney(unbet)}</strong></div>`;
}

function render(card, { cached = false, cacheAgeMs = 0 } = {}) {
  lastCard = card;
  $('#emptyState').classList.add('hidden');
  $('#card').classList.remove('hidden');
  $('#cardDate').textContent = `${card.date} · ${card.sport}`;
  $('#cardTitle').textContent = 'Daily betting card';
  $('#marketFreshness').textContent = prettyTime(card.latestMarketUpdate || card.generatedAt);
  $('#priceNote').textContent = card.priceNote || 'Reference prices can differ from FanDuel Canada.';
  $('#summary').textContent = card.summary || '';
  const existing = $('#cacheBanner');
  if (existing) existing.remove();
  if (cached) {
    const mins = Math.max(1, Math.round(cacheAgeMs / 60000));
    $('#priceNote').insertAdjacentHTML('beforebegin', `<div id="cacheBanner" class="cache-banner"><span><b>Cached card</b> · ${mins} min old · no new API credits used</span><span>${cacheAgeMs <= CARD_CACHE_MS ? 'Fresh cache' : 'Stale — refresh before betting'}</span></div>`);
  }
  if (card.oddsQuota) {
    saveQuota(card.oddsQuota);
    updateQuotaUI(card.oddsQuota);
  }

  const r = card.rankings || {};
  $('#rankGrid').innerHTML = [
    rankCard('🏆 BEST BET', r.bestBet, 'best-card'),
    rankCard('🛡 SAFEST', r.safest),
    rankCard('💰 BEST VALUE', r.bestValue),
    rankCard('👤 BEST PROP', r.bestPlayerProp),
    rankCard('＋ BEST PLUS-MONEY', r.bestPlusMoney)
  ].join('');

  $('#candidateRows').innerHTML = (card.candidates || []).map(c => `<tr>
    <td><div class="table-bet"><b>${esc(betName(c))}</b><small>${esc(c.game || '')}</small></div></td>
    <td>${esc(c.bookmaker || '')}</td>
    <td>${fmtOdds(c.odds)}</td>
    <td>${fmtPct(c.impliedProbability)}</td>
    <td>${fmtPct(c.estimatedProbability)}</td>
    <td class="${c.edge > 0 ? 'edge-pos' : c.edge < 0 ? 'edge-neg' : ''}">${fmtPct(c.edge)}</td>
    <td><span class="confidence-pill">${c.confidence ?? '—'}/10</span></td>
  </tr>`).join('') || `<tr><td colspan="7" class="empty-table">No bets cleared the research filter.</td></tr>`;

  $('#candidateDetails').innerHTML = (card.candidates || []).slice(0,8).map((c, i) => `<article class="detail">
    <div class="detail-top"><span>#${String(i + 1).padStart(2,'0')}</span><b>${esc(betName(c))}</b><strong>${fmtOdds(c.odds)}</strong></div>
    <p>${esc(c.why || '')}</p>
    <div class="risk"><b>Main risk</b><span>${esc(c.mainRisk || 'Unspecified')}</span></div>
    ${(c.flags || []).length ? `<div class="flags">${c.flags.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
  </article>`).join('');

  const p = card.parlays || {};
  const pn = card.parlayNotes || {};
  const renderParlay = (title, legs, note, tone) => {
    const decimal = parlayDecimal(legs);
    const amer = decimalToAmerican(decimal);
    return `<article class="parlay ${tone}">
      <div class="parlay-head"><h3>${title}</h3><span>${amer ? `~${fmtOdds(amer)}` : 'PASS'}</span></div>
      ${legs?.length ? `<ol>${legs.map(x => `<li><span>${esc(betName(x))}</span><b>${fmtOdds(x.odds)}</b></li>`).join('')}</ol>` : '<div class="pass-state">No forced legs.</div>'}
      <p>${esc(note || '')}</p>
      ${amer ? '<small>Approx. combined price from reference lines; same-game pricing may differ.</small>' : ''}
    </article>`;
  };
  $('#parlayGrid').innerHTML = [
    renderParlay('🎯 Conservative', p.conservative, pn.conservative, 'safe-parlay'),
    renderParlay('⚖️ Balanced', p.balanced, pn.balanced, 'balanced-parlay'),
    renderParlay('🚀 Long shot', p.longShot, pn.longShot, 'long-parlay')
  ].join('');

  $('#topThree').innerHTML = (card.topThree || []).map(x => `<li><span>${esc(betName(x))}</span><b>${fmtOdds(x.odds)}</b></li>`).join('') || '<li>No three bets cleared the threshold.</li>';
  const warnings = [...(r.pass || []), ...(card.warnings || [])];
  $('#warnings').innerHTML = warnings.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No additional warnings.</li>';

  $('#sourceCount').textContent = `${(card.sources || []).length} source${(card.sources || []).length === 1 ? '' : 's'}`;
  $('#sources').innerHTML = (card.sources || []).map(s => {
    let host = 'Source';
    try { host = new URL(s.url).hostname.replace(/^www\./,''); } catch {}
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener"><span>${esc(host)}</span>${esc(s.title || host)}<b>↗</b></a>`;
  }).join('') || '<span class="no-sources">No web citations were returned for this card.</span>';

  renderStakePlan(card);
}

async function generate({ force = false } = {}) {
  $('#errorBox').classList.add('hidden');
  const cached = loadCachedCard();
  const age = cached ? Date.now() - Number(cached.savedAt || 0) : Infinity;
  if (!force && cached && age <= CARD_CACHE_MS) {
    render(cached.card, { cached:true, cacheAgeMs:age });
    $('#cacheBadge').textContent = 'CACHE FRESH';
    $('#cacheDetail').textContent = `${Math.max(1, Math.round(age/60000))} min old · no credits spent`;
    return;
  }
  $('#card').classList.add('hidden');
  $('#emptyState').classList.add('hidden');
  $('#loading').classList.remove('hidden');
  $('#generateBtn').disabled = true;
  const low = $('#lowCreditMode').checked;
  const research = $('#researchMode').value;
  $('#loadingText').textContent = low ? 'Low Credit Mode: requesting moneylines only, then researching the slate…' : 'Comparing prices, lineups, injuries, matchup data and recent form…';
  try {
    const res = await fetch(`/api/daily-picks?sport=${encodeURIComponent(sport)}&mode=${low ? 'low' : 'full'}&research=${encodeURIComponent(research)}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not generate card.');
    saveCachedCard(data);
    render(data);
    $('#cacheBadge').textContent = 'CACHE SAVED';
    $('#cacheDetail').textContent = 'Fresh for 30 min · reopening costs 0 credits';
  } catch (e) {
    const msg = String(e.message || e);
    const quotaProblem = /OUT_OF_USAGE_CREDITS|usage credits|quota|credits/i.test(msg);
    if (cached) {
      render(cached.card, { cached:true, cacheAgeMs:age });
      $('#errorBox').textContent = quotaProblem ? 'Odds quota is exhausted. Showing your last cached card instead — treat prices as stale until the quota resets or you update the Odds API plan.' : `${msg} Showing your last cached card.`;
    } else {
      $('#errorBox').textContent = quotaProblem ? 'The Odds API quota is exhausted. Daily Card cannot price a new wager until the quota resets. Results screenshot OCR still works for free, and Bet Check can use a FanDuel screenshot.' : msg;
      $('#emptyState').classList.remove('hidden');
    }
    $('#errorBox').classList.remove('hidden');
  } finally {
    $('#loading').classList.add('hidden');
    $('#generateBtn').disabled = false;
  }
}

$('#generateBtn').addEventListener('click', () => generate({ force:false }));
$('#refreshBtn').addEventListener('click', () => generate({ force:true }));

async function compressImage(file) {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/)) throw new Error('Use a PNG, JPG or WebP screenshot.');
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

$('#slipImage').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  $('#checkError').classList.add('hidden');
  try {
    screenshotDataUrl = await compressImage(file);
    $('#imagePreview').src = screenshotDataUrl;
    $('#imagePreview').classList.remove('hidden');
    $('#uploadPrompt').classList.add('hidden');
    $('#uploadZone').classList.add('has-image');
  } catch (err) {
    $('#checkError').textContent = err.message;
    $('#checkError').classList.remove('hidden');
  }
});

$('#clearSlipBtn').addEventListener('click', () => {
  screenshotDataUrl = null;
  $('#slipImage').value = '';
  $('#slipText').value = '';
  $('#imagePreview').src = '';
  $('#imagePreview').classList.add('hidden');
  $('#uploadPrompt').classList.remove('hidden');
  $('#uploadZone').classList.remove('has-image');
  $('#checkResult').classList.add('hidden');
  $('#checkError').classList.add('hidden');
});

function verdictClass(v) {
  const x = String(v || '').toUpperCase();
  return x === 'KEEP' ? 'keep' : x === 'REMOVE' ? 'remove' : 'replace';
}

function renderBetCheck(data) {
  const r = data.result || {};
  const legs = r.legs || [];
  $('#checkResult').innerHTML = `
    <section class="check-summary panel">
      <div class="check-summary-top"><div><div class="eyebrow">BET CHECK RESULT</div><h2>${esc(r.summary || 'Slip analysis')}</h2></div><span class="badge">${legs.length} leg${legs.length === 1 ? '' : 's'}</span></div>
      <div class="weakest"><span>WEAKEST LEG</span><b>${esc(r.weakestLeg || 'None identified')}</b></div>
      <p>${esc(r.combinedRisk || '')}</p>
    </section>
    <div class="leg-grid">
      ${legs.map((leg, i) => `<article class="leg-card">
        <div class="leg-top"><span>LEG ${i+1}</span><b class="verdict ${verdictClass(leg.verdict)}">${esc(leg.verdict || 'REVIEW')}</b></div>
        <h3>${esc(leg.bet)}</h3>
        <div class="leg-meta"><span>${esc(leg.odds || 'Odds unknown')}</span><span>${esc(String(leg.confidence ?? '—'))}/10 confidence</span></div>
        <p>${esc(leg.why || '')}</p>
        <div class="leg-risk"><b>Main risk</b><span>${esc(leg.mainRisk || 'Unspecified')}</span></div>
        <div class="price-note">${esc(leg.priceNote || '')}</div>
      </article>`).join('')}
    </div>
    <section class="panel recommendation"><div class="eyebrow">RECOMMENDATION</div><h3>${esc(r.recommendation || 'No recommendation returned.')}</h3>${(r.warnings || []).length ? `<ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</section>
    <section class="sources panel"><div class="source-head"><div><div class="eyebrow">RESEARCH TRAIL</div><h3>Sources checked</h3></div><span class="badge">${(data.sources || []).length} sources</span></div><div class="source-links">${(data.sources || []).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}<b>↗</b></a>`).join('') || '<span class="no-sources">No web citations returned.</span>'}</div></section>`;
  $('#checkResult').classList.remove('hidden');
}

$('#checkBtn').addEventListener('click', async () => {
  const slipText = $('#slipText').value.trim();
  if (!slipText && !screenshotDataUrl) {
    $('#checkError').textContent = 'Upload a screenshot or paste the slip first.';
    $('#checkError').classList.remove('hidden');
    return;
  }
  $('#checkError').classList.add('hidden');
  $('#checkResult').classList.add('hidden');
  $('#checkLoading').classList.remove('hidden');
  $('#checkBtn').disabled = true;
  try {
    const res = await fetch('/api/bet-check', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sport, slipText, screenshotDataUrl })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Bet check failed.');
    renderBetCheck(data);
  } catch(e) {
    $('#checkError').textContent = e.message;
    $('#checkError').classList.remove('hidden');
  } finally {
    $('#checkLoading').classList.add('hidden');
    $('#checkBtn').disabled = false;
  }
});

function americanProfit(stake, odds, outcome) {
  if (outcome === 'push') return 0;
  if (outcome === 'loss') return -stake;
  const o = Number(odds);
  return o > 0 ? stake * (o / 100) : stake * (100 / Math.abs(o));
}

function loadResults() {
  try { return JSON.parse(localStorage.getItem('betmode:results') || '[]'); } catch { return []; }
}
function saveResults(rows) { localStorage.setItem('betmode:results', JSON.stringify(rows)); }

function renderResults() {
  const rows = loadResults();
  const totalStake = rows.reduce((a,r) => a + Number(r.stake || 0), 0);
  const pnl = rows.reduce((a,r) => a + americanProfit(Number(r.stake), Number(r.odds), r.outcome), 0);
  const wins = rows.filter(r => r.outcome === 'win').length;
  const losses = rows.filter(r => r.outcome === 'loss').length;
  const decisions = wins + losses;
  const roi = totalStake ? pnl / totalStake : 0;
  const winRate = decisions ? wins / decisions : 0;

  $('#resultsStats').innerHTML = `
    <article><span>NET P/L</span><b class="${pnl > 0 ? 'profit' : pnl < 0 ? 'loss' : ''}">${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)}</b></article>
    <article><span>ROI</span><b class="${roi > 0 ? 'profit' : roi < 0 ? 'loss' : ''}">${roi >= 0 ? '+' : ''}${(roi*100).toFixed(1)}%</b></article>
    <article><span>WIN RATE</span><b>${(winRate*100).toFixed(1)}%</b></article>
    <article><span>WAGERS</span><b>${rows.length}</b></article>`;

  $('#resultsTableWrap').innerHTML = rows.length ? `<table class="history-table"><thead><tr><th>Date</th><th>Bet</th><th>Stake</th><th>Odds</th><th>Result</th><th>P/L</th><th></th></tr></thead><tbody>${rows.slice().reverse().map(r => {
    const p = americanProfit(Number(r.stake), Number(r.odds), r.outcome);
    return `<tr><td>${esc(r.date)}</td><td><b>${esc(r.bet)}</b><small>${esc(r.sport)} · ${esc(r.type)}</small></td><td>${fmtMoney(r.stake)}</td><td>${fmtOdds(r.odds)}</td><td><span class="result-pill ${esc(r.outcome)}">${esc(r.outcome.toUpperCase())}</span></td><td class="${p > 0 ? 'profit' : p < 0 ? 'loss' : ''}">${p >= 0 ? '+' : ''}${fmtMoney(p)}</td><td><button class="delete-result" data-id="${esc(r.id)}" aria-label="Delete result">×</button></td></tr>`;
  }).join('')}</tbody></table>` : '<div class="no-history">No results saved yet. Start by recording one wager.</div>';

  $$('.delete-result').forEach(btn => btn.addEventListener('click', () => {
    saveResults(loadResults().filter(r => r.id !== btn.dataset.id));
    renderResults();
  }));
}

$('#resultForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const rows = loadResults();
  rows.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    date: $('#resultDate').value,
    sport: $('#resultSport').value,
    bet: $('#resultBet').value.trim(),
    stake: Number($('#resultStake').value),
    odds: Number($('#resultOdds').value),
    outcome: $('#resultOutcome').value,
    type: $('#resultType').value
  });
  saveResults(rows);
  $('#resultBet').value = '';
  renderResults();
});

$('#clearResultsBtn').addEventListener('click', () => {
  if (confirm('Clear all locally saved betting results?')) {
    saveResults([]);
    renderResults();
  }
});

$('#resultDate').value = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
renderResults();

(async () => {
  await health();
  restoreCachedCard();
})();
