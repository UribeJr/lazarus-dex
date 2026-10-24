/* Lazarus·Dex — static client. All data comes from data/dex.json (built at build time). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => String(s).replace(/(^|[\s-])\w/g, m => m.toUpperCase());
const pretty = s => cap(String(s).replace(/-/g, ' '));
const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const TYPES = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
let DEX, BY = {}, BYSPECIES = {}, AREAS = {};
const state = { slow: true, napping: false, area: null, mon: null, filter: 'all', scope: 'all', listY: 0, quiet: false };
const PHONE = matchMedia('(max-width:720px)'), TABLET = matchMedia('(min-width:721px) and (max-width:1179px)');

// ---------- sprites: Gen 5 animated GIF -> static PNG -> placeholder; whole device-pixel scaling only ----------
function spriteSources(p) {
  const s = []; if (p.pokeapiId <= 649) s.push({ src: `${SPR}versions/generation-v/black-white/animated/${p.pokeapiId}.gif` });
  s.push({ src: `${SPR}${p.pokeapiId}.png`, cors: true }, { src: `${SPR}${p.pokeapiId}.png` }); return s;
}
const sprRO = new ResizeObserver(es => es.forEach(e => e.target._fit && e.target._fit()));
// static PNGs sit on a 96px canvas with transparent padding; crop to the visible pixels so they centre and scale up
function trimmed(img) {
  const w = img.naturalWidth, h = img.naturalHeight, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) if (d[(y * w + X) * 4 + 3] > 8) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; y1 = y; }
  if (x1 < 0) return null;
  const t = document.createElement('canvas'); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
  t.getContext('2d').drawImage(img, x0, y0, t.width, t.height, 0, 0, t.width, t.height); return t;
}
function sprite(p) {
  const box = document.createElement('div'); box.className = 'spr id';
  const img = new Image(); img.alt = p.name; img.decoding = 'async';
  const srcs = spriteSources(p); let i = 0, el = img, w = 0, h = 0;
  box._fit = () => {
    const room = box.clientWidth - 14; if (!w || room <= 0) return;
    const dpr = devicePixelRatio || 1, n = Math.floor(room * dpr / Math.max(w, h));
    el.style.width = w * (n >= dpr ? Math.min(4, n / dpr) : Math.min(1, room / Math.max(w, h))) + 'px';
  };
  img.onload = () => {
    w = img.naturalWidth; h = img.naturalHeight;
    if (srcs[i].cors) try { const t = trimmed(img); if (t) { t.setAttribute('role', 'img'); t.setAttribute('aria-label', p.name); img.replaceWith(t); el = t; w = t.width; h = t.height; } } catch { /* tainted: keep padded image */ }
    box._fit();
  };
  const load = () => { img.crossOrigin = srcs[i].cors ? 'anonymous' : null; if (!srcs[i].cors) img.removeAttribute('crossorigin'); img.src = srcs[i].src; };
  img.onerror = () => { if (++i < srcs.length) load(); else { img.remove(); box.insertAdjacentHTML('beforeend', '<span class="ph" role="img" aria-label="no sprite">?</span>'); } };
  load(); box.appendChild(img); sprRO.observe(box); return box;
}
const iconSrc = p => `${SPR}${p.pokeapiId}.png`;

// ---------- matchups from PokeAPI damage_relations ----------
function matchups(types) {
  const m = Object.fromEntries(TYPES.map(t => [t, 1]));
  for (const t of types) { const d = DEX.types[t]; if (!d) continue;
    d.double_damage_from.forEach(x => m[x] *= 2); d.half_damage_from.forEach(x => m[x] *= .5); d.no_damage_from.forEach(x => m[x] = 0); }
  const g = {}; for (const [t, v] of Object.entries(m)) if (v !== 1) (g[v] ||= []).push(t); return g;
}
const LAND = new Set(['day', 'night']);
const methodLabel = l => l.method === 'fishing' ? 'Fishing' : l.method === 'surfing' ? 'Surfing' : l.method === 'underwater' ? 'Underwater' : 'Land';
const timeLabel = l => l.both || !LAND.has(l.method) ? 'Day / Night' : l.method === 'day' ? 'Day' : 'Night';
// one row per area+method+rod+rate; a matching Day and Night land row collapse into "Day / Night"
function mergedLocations(p) {
  const out = [];
  for (const l of p.locations || []) {
    const twin = LAND.has(l.method) && out.find(o => !o.both && o.area === l.area && LAND.has(o.method) && o.method !== l.method && o.rate === l.rate);
    if (twin) twin.both = true; else out.push({ ...l });
  }
  return out.sort((a, b) => b.rate - a.rate || a.areaName.localeCompare(b.areaName));
}
// chain nodes resolved to dex entries, grouped into stages by depth
function evoStages(p) {
  const reg = (p.name.match(/^(Alolan|Galarian|Hisuian|Paldean)\b/) || [])[1];
  const nodes = p.evolutions.map(e => {
    const cands = DEX.pokemon.filter(x => x.speciesId === e.speciesId && x.obtain?.type !== 'mega');
    const mon = (e.speciesId === p.speciesId && p.obtain?.type !== 'mega' ? p : null) || (reg && cands.find(x => x.name.startsWith(reg))) || cands.find(x => !/^(Alolan|Galarian|Hisuian|Paldean) /.test(x.name)) || cands[0];
    if (e.speciesId === p.speciesId && p.obtain?.type === 'evolution') e = { ...e, how: p.obtain.how };
    return { ...e, mon, label: mon ? mon.name : pretty(e.name) };
  });
  const by = Object.fromEntries(nodes.map(n => [n.speciesId, n])), depth = n => n.from == null || !by[n.from] ? 0 : depth(by[n.from]) + 1;
  const stages = []; nodes.forEach(n => (stages[depth(n)] ||= []).push(n));
  return { stages: stages.filter(Boolean), by, nodes };
}

// ---------- dex entry ----------
function renderEntry(p) {
  const el = $('#entry'); state.mon = p.id; el.innerHTML = ''; sprRO.disconnect();
  const head = document.createElement('div'); head.className = 'ident'; head.appendChild(sprite(p));
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.innerHTML = `<div class="no">No.${String(p.nationalNo).padStart(3, '0')}</div><h2 class="name">${esc(p.name.toUpperCase())}</h2>
    <div class="types">${p.types.map(t => `<span class="type">${t}</span>`).join('')}</div>
    <div class="dims">${esc(p.genus || '')}${p.form ? ' · ' + esc(p.form) : ''}</div><div class="dims">${(p.height / 10).toFixed(1)} m · ${(p.weight / 10).toFixed(1)} kg</div>`;
  head.appendChild(meta); el.appendChild(head);
  const { stages, by, nodes } = evoStages(p);
  const lzNotes = new Map(); nodes.filter(n => n.lazarus).forEach(n => { const k = n.note || ''; if (!lzNotes.has(k)) lzNotes.set(k, []); lzNotes.get(k).push(`${n.label} (${pretty(n.how || '')})`); });
  // where to find
  const L = mergedLocations(p), o = p.obtain || {};
  let h = '<h3>▸ WHERE TO FIND (LAZARUS)</h3>';
  if (L.length) h += `<table class="loc" role="table"><thead><tr role="row"><th role="columnheader">AREA</th><th role="columnheader">TIME</th><th role="columnheader">METHOD</th><th role="columnheader" class="p">RATE</th></tr></thead><tbody>${L.map(l => `<tr role="row" data-area="${l.area}"><td role="cell" class="a"><a href="#/area/${l.area}">${esc(l.areaName)}</a></td><td role="cell" class="t">${timeLabel(l)}</td><td role="cell" class="m">${methodLabel(l)}${l.rod ? ' · ' + l.rod + ' Rod' : ''}</td><td role="cell" class="p">${l.rate}%</td></tr>`).join('')}</tbody></table>`;
  else h += '<p class="empty">No wild encounters in Lazarus.</p>';
  if (o.type === 'evolution' || o.type === 'mega') {
    const f = BY[o.fromId], dup = o.confirmed && lzNotes.has(o.note);
    h += `<p class="obtain"><b class="k">${o.type === 'mega' ? 'MEGA EVOLVE' : 'EVOLVE'}:</b> from ${f ? `<a href="#/mon/${f.id}">${esc(f.name)}</a>` : esc(o.fromName)} — ${esc(pretty(o.how))}</p>` +
      (o.item ? `<p class="obtain"><b class="k">ITEM:</b> ${esc(o.item)}</p>` : '') +
      `<p class="${o.confirmed ? 'verified' : 'unconf'}">${o.confirmed ? '✓ CONFIRMED FOR LAZARUS' + (o.note && !dup ? ' · ' + esc(o.note) : '') : '? Standard method, not confirmed for Lazarus.'}</p>`;
  }
  if (p.special) h += `<p><b class="k">SPECIAL:</b> ${esc(p.special)}</p>`;
  // evolution: stages left→right (top→bottom when narrow); branches stack inside a stage
  if (stages.length > 1) h += '<h3>▸ EVOLUTION</h3><ol class="evo">' + stages.map((s, i) => `<li class="stage">${s.map(n => {
    const cur = n.mon && n.mon.id === p.id, from = i && stages[i - 1].length > 1 && by[n.from] ? `from ${esc(by[n.from].label)} · ` : '';
    const req = i ? `<span class="req">→ ${from}${esc(n.how ? pretty(n.how) : 'Method unknown')}</span>` : '';
    const lz = n.lazarus ? `<span class="lz" title="${esc(n.note)}">LZ</span>` : '';
    const card = cur ? `<span class="st" aria-current="true">${esc(n.label)}${lz}</span>` : n.mon ? `<a class="st" href="#/mon/${n.mon.id}">${esc(n.label)}${lz}</a>` : `<span class="st off" title="Not obtainable in Lazarus">${esc(n.label)}${lz}<span class="vh"> (not obtainable in Lazarus)</span></span>`;
    return `<div class="node">${req}${card}</div>`; }).join('')}</li>`).join('') + '</ol>';
  // Lazarus-specific changes, only where the override data records one
  if (lzNotes.size) h += '<h3>▸ LAZARUS CHANGES</h3>' + [...lzNotes].map(([note, who]) => `<p class="lzn"><span class="lz">LZ</span> ${esc(note)}<small>${esc(who.join(' · '))}</small></p>`).join('');
  // battle details
  const SN = { hp: 'HP', attack: 'ATK', defense: 'DEF', 'special-attack': 'SP.A', 'special-defense': 'SP.D', speed: 'SPE' };
  const tot = Object.values(p.stats).reduce((a, b) => a + b, 0);
  h += `<div class="grid2"><div><h3>▸ BASE STATS (${tot})</h3>${Object.entries(p.stats).map(([k, v]) => `<div class="stat"><span class="k">${SN[k] || k}</span><span>${v}</span><span class="bar"><i style="width:${Math.min(100, v / 1.8)}%"></i></span></div>`).join('')}
    <h3>▸ ABILITIES</h3>${p.abilities.map(a => `<div>${pretty(a.name)}${a.hidden ? ' <span class="k">(H)</span>' : ''}</div>`).join('')}</div>`;
  const mx = matchups(p.types), lab = { 4: '4×', 2: '2×', 0.5: '½×', 0.25: '¼×', 0: '0×' };
  h += `<div><h3>▸ DAMAGE TAKEN</h3>${[4, 2, 0.5, 0.25, 0].filter(k => mx[k]).map(k => `<div class="mx"><span class="lbl">${lab[k]}</span>${mx[k].map(t => `<span class="type">${t}</span>`).join('')}</div>`).join('')}</div></div>`;
  h += `<h3>▸ DEX DESCRIPTION</h3><p class="flavor">“${esc(p.flavor || 'No flavor text.')}”</p>`;
  h += `<p class="verified">✓ DATA · pokemonlazarus.net (${esc(DEX.locationsFetched)}) · PokeAPI</p>`;
  el.insertAdjacentHTML('beforeend', h);
  el.scrollTop = 0; $$('.list a').forEach(a => a.toggleAttribute('aria-current', a.dataset.id === p.id));
}

// ---------- browse: list view stays mounted so search, filters and scroll survive area visits ----------
const speciesIn = a => new Set(a.groups.flatMap(g => g.encounters.map(e => e.name))).size;
const listY = () => PHONE.matches ? ($('#dev').dataset.pane === 'area' ? scrollY : scrolls.area ?? 0) : $('#side').scrollTop;
function renderArea(a) {
  if (state.area == null) state.listY = listY();
  state.area = a.id; $('#areaCap').textContent = `▣ BROWSE ▸ AREA ${String(a.index).padStart(2, '0')}`;
  const s = $('#areaView');
  const grp = g => `<h3>${g.method === 'day' ? '☀' : g.method === 'night' ? '☾' : g.method === 'fishing' ? '⌇' : '≈'} ${esc(g.label.toUpperCase())}</h3><ul class="list">${g.encounters.map(e => { const p = BY[nid(e.name)]; return `<li><a href="#/mon/${p ? p.id : ''}" data-id="${p ? p.id : ''}"${p && p.id === state.mon ? ' aria-current="true"' : ''}>${p ? `<img src="${iconSrc(p)}" crossorigin="anonymous" alt="" loading="lazy" width="32" height="32">` : ''}<span style="flex:1">${esc(e.name)}${e.rod ? ` <i>${e.rod}</i>` : ''}</span><b>${e.rate}%</b></a></li>`; }).join('')}</ul>`;
  const day = a.groups.find(g => g.method === 'day'), night = a.groups.find(g => g.method === 'night'), rest = a.groups.filter(g => g !== day && g !== night);
  s.innerHTML = `<button class="back" data-go="list">◂ BACK TO BROWSE</button><h2>${esc(a.name.toUpperCase())}</h2><p class="count">${speciesIn(a)} SPECIES · % = ENCOUNTER RATE</p>
    <div class="cols">${day ? '<div>' + grp(day) + '</div>' : ''}${night ? '<div>' + grp(night) + '</div>' : ''}</div>${rest.map(grp).join('')}`;
  $('#listView').hidden = true; s.hidden = false; $('#side').scrollTop = 0; hideBrokenIcons(s);
}
function openList() {
  state.area = null; $('#areaCap').textContent = '▣ BROWSE';
  $('#areaView').hidden = true; $('#listView').hidden = false; if (!PHONE.matches) $('#side').scrollTop = state.listY;
}
function renderList() {
  const s = $('#listView');
  s.innerHTML = `<input class="search" id="find" type="search" placeholder="Search Pokémon or area…" aria-label="Search Pokémon or area">
    <div class="seg" role="group" aria-label="List">${['all', 'pokemon', 'areas'].map(f => `<button data-f="${f}" aria-pressed="${state.filter === f}">${f.toUpperCase()}</button>`).join('')}</div><div class="seg" role="group" aria-label="Pokémon scope">${[['all', 'ALL DEX'], ['wild', 'WILD/GIFT'], ['evo', 'EVOLVE']].map(([k, l]) => `<button data-s="${k}" aria-pressed="${state.scope === k}">${l}</button>`).join('')}</div>
    <p class="count">${DEX.counts ? `${DEX.counts.entries} ENTRIES · ${DEX.counts.species} SPECIES` : ''}</p><div id="results"></div>`;
  const draw = () => {
    const q = $('#find').value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const m = x => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
    const areas = state.filter !== 'pokemon' ? DEX.areas.filter(a => !q || m(a.name)) : [];
    const mons = state.filter !== 'areas' ? DEX.pokemon.filter(p => (state.scope === 'all' || (state.scope === 'evo') === /evolution|mega/.test(p.obtain?.type || ''))).filter(p => !q || m(p.name) || String(p.nationalNo) === q || p.types.some(t => t === q)) : [];
    $('#results').innerHTML = (areas.length ? `<h3 class="lh"><span>▸ AREAS (${areas.length})</span><small>SPECIES</small></h3><ul class="list">${areas.map(a => { const n = speciesIn(a); return `<li><a href="#/area/${a.id}"><span>${esc(a.name)}</span><b title="${n} species">${n}<span class="vh"> species</span></b></a></li>`; }).join('')}</ul>` : '') +
      (mons.length ? `<h3 class="lh"><span>▸ POKÉMON (${mons.length})</span><small>DEX NO.</small></h3><ul class="list">${mons.map(p => `<li><a href="#/mon/${p.id}" data-id="${p.id}"${p.id === state.mon ? ' aria-current="true"' : ''}><img src="${iconSrc(p)}" crossorigin="anonymous" alt="" loading="lazy" width="32" height="32"><span style="flex:1">${esc(p.name)}${/evolution|mega/.test(p.obtain?.type) ? ' <i title="Obtained by evolution">EVO</i>' : ''}</span><b><span class="vh">No. </span>${String(p.nationalNo).padStart(3, '0')}</b></a></li>`).join('')}</ul>` : '') ||
      '<p class="empty">Nothing here… even the Slakoth gave up looking.</p>';
    hideBrokenIcons($('#results'));
  };
  $('#find').addEventListener('input', draw);
  $$('.seg button[data-f]', s).forEach(b => b.onclick = () => { state.filter = b.dataset.f; $$('.seg button[data-f]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  $$('.seg button[data-s]', s).forEach(b => b.onclick = () => { state.scope = b.dataset.s; $$('.seg button[data-s]', s).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  draw();
}
function hideBrokenIcons(r) { $$('img', r).forEach(i => i.addEventListener('error', () => { i.style.visibility = 'hidden'; }, { once: true })); }
const nid = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---------- chat ----------
let typing = null;
function bubble(cls, text) { const b = document.createElement('div'); b.className = 'bub ' + cls; b.textContent = text; $('#log').appendChild(b); $('#log').scrollTop = 1e9; return b; }
function typeOut(el, text, extra) {
  return new Promise(done => {
    const finish = () => { clearTimeout(typing?.t); typing = null; el.textContent = text; if (extra) el.insertAdjacentHTML('beforeend', extra); $('#log').scrollTop = 1e9; done(); };
    if (!state.slow) return finish();
    el.textContent = ''; const cur = document.createElement('span'); cur.className = 'cur'; let i = 0;
    typing = { finish };
    const step = () => {
      if (state.napping) { typing.t = setTimeout(step, 400); return; }
      el.textContent = text.slice(0, ++i); el.appendChild(cur); $('#log').scrollTop = 1e9;
      if (i >= text.length) return finish();
      const ch = text[i - 1]; typing.t = setTimeout(step, /[.!?…]/.test(ch) ? 420 : ch === ',' ? 200 : 55);
    };
    el.onclick = () => typing && typing.finish(); step();
  });
}
async function ask(q) {
  bubble('me', '> ' + q); const b = bubble('', '');
  $('#status').textContent = 'Prof. Snooze is waking up… z z z';
  let j;
  try {
    const r = await fetch('api/snooze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) });
    j = await r.json().catch(() => ({}));
    if (!j.answer) j = { ok: false, answer: j.error || "Prof. Snooze mumbled something unintelligible. Try again in a bit.", sources: [] };
  } catch { j = { ok: false, resting: true, answer: "Prof. Snooze is offline (resting). Try BROWSE to search the dex instead!", sources: [] }; }
  const src = (j.sources || []).length ? `<span class="src">${j.sources.map(s => `<a href="#/${s.kind}/${esc(s.id)}">▸ ${esc(s.t)}</a>`).join('')}</span>` : '';
  const tag = `<span class="tag">${j.resting ? 'RESTING · ' : ''}${j.model && j.model !== 'computed' ? esc(j.model.replace('openai/', '')) : j.model === 'computed' ? 'DEX LOOKUP' : ''}${j.cached ? ' · CACHED' : ''}</span>`;
  $('#status').textContent = state.slow ? 'typing… slowly (tap to skip)' : '';
  await typeOut(b, j.answer, src + tag);
  $('#status').textContent = 'Ask about any Pokémon or area. Prof. Snooze only knows the Lazarus tables.';
  // off-phone, follow the first source without pulling the chat out of view (quiet = keep the current tab)
  if (j.sources?.[0] && !PHONE.matches) { const h = `#/${j.sources[0].kind}/${j.sources[0].id}`; if (location.hash !== h) { state.quiet = true; location.hash = h; } }
}

// ---------- nap / slow / dmg ----------
function nap(on) { state.napping = on; $('#napscreen').hidden = !on; document.body.classList.toggle('nap', on); }
const go = h => location.hash === h ? route() : (location.hash = h);
function route() {
  const quiet = state.quiet; state.quiet = false;
  const [, kind, id] = location.hash.match(/^#\/(mon|area)\/([\w-]+)/) || [];
  if (kind === 'mon' && BY[id]) { renderEntry(BY[id]); if (!quiet) show('dex', 'top'); }
  else if (kind === 'area' && AREAS[id]) { renderArea(AREAS[id]); if (!quiet) show('area', 'top'); }
  else if (location.hash === '#/list') { openList(); if (!quiet) show('area', state.listY); }
}
// phone: one pane (data-pane); tablet: entry + one side pane (data-side); desktop: everything
const scrolls = {};
function syncTabs() { const dev = $('#dev'), k = TABLET.matches ? dev.dataset.side : dev.dataset.pane; $$('.tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pane === k)); }
function show(p, y) {
  const dev = $('#dev'), prev = dev.dataset.pane;
  if (PHONE.matches && prev !== p) scrolls[prev] = scrollY;
  dev.dataset.pane = p; if (p !== 'dex') dev.dataset.side = p; syncTabs();
  if (!PHONE.matches) return;
  if (y === 'top') y = Math.min(scrollY, $('.top').offsetHeight + 8); // screen top, just under the sticky tabs
  else if (y == null) y = prev === p ? scrollY : scrolls[p] ?? 0;
  scrollTo(0, y);
}
function opts(on) { $('#optBtn').setAttribute('aria-expanded', on); $('#opts').classList.toggle('open', on); }

async function init() {
  show('chat');
  $$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.pane));
  [PHONE, TABLET].forEach(m => m.addEventListener('change', syncTabs));
  $('#slow').onchange = e => { state.slow = e.target.checked; $('#slowLbl').textContent = state.slow ? 'ON' : 'OFF'; if (!state.slow && typing) typing.finish(); };
  $('#dmgT').onchange = e => document.body.classList.toggle('dmg', e.target.checked);
  $('#optBtn').onclick = () => opts($('#optBtn').getAttribute('aria-expanded') !== 'true');
  document.addEventListener('click', e => { if (!e.target.closest('#opts, #optBtn')) opts(false); });
  $('#wide').onclick = () => { const on = $('#dev').classList.toggle('wide'); $('#wide').setAttribute('aria-pressed', on); $('#wide').textContent = on ? '◂ SLIM' : 'WIDE ▸'; };
  $('#nap').onclick = () => nap(true); $('#napscreen').onclick = () => nap(false);
  addEventListener('keydown', e => {
    if (state.napping) { nap(false); e.preventDefault(); return; }
    if (e.key === 'Escape' && $('#opts').classList.contains('open')) { opts(false); $('#optBtn').focus(); return; }
    if ((e.key === 'b' || e.key === 'B') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) nap(true);
  });
  $('#ask').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (!q) return; $('#q').value = ''; ask(q); };
  $('#side').addEventListener('click', e => { if (e.target.closest('[data-go=list]')) go('#/list'); });
  // whole encounter row opens the area; the link inside stays the keyboard target
  $('#entry').addEventListener('click', e => { const tr = e.target.closest('tr[data-area]'); if (tr && !e.target.closest('a')) go('#/area/' + tr.dataset.area); });
  try { const r = await fetch('data/dex.json'); DEX = await r.json(); } catch {
    // file:// pages can't fetch local JSON; say how to run it instead of hanging on "Loading dex…"
    $('#entry').innerHTML = location.protocol === 'file:' ? '<p>Prof. Snooze can\'t read the dex from a file:// page.</p><p class="k" style="margin-top:10px;line-height:1.6">RUN: node dev-server.js<br>OPEN: http://localhost:3000</p>' : '<p>Couldn\'t load the dex. Try reloading.</p>';
    return;
  }
  DEX.pokemon.forEach(p => { BY[p.id] = p; if (!BYSPECIES[p.speciesId]) BYSPECIES[p.speciesId] = p; }); DEX.areas.forEach(a => AREAS[a.id] = a);
  const hello = bubble('', '');
  hello.textContent = "*yaaawn*… oh, a trainer. I'm Prof. Snooze. I know every wild encounter and evolution in the Ilios region — slowly. Ask me something:";
  hello.insertAdjacentHTML('beforeend', `<span class="chips">${['Where do I catch Dratini?', "What's in Pythios Cemetery?", 'Where is Gengar?'].map(q => `<button class="chip" type="button">${esc(q)}</button>`).join('')}</span>`);
  $$('.chip', hello).forEach(c => c.onclick = ev => { ev.stopPropagation(); ask(c.textContent); });
  renderList();
  if (location.hash) route();
  if (!state.mon) renderEntry(BY.dratini);
  addEventListener('hashchange', route);
}
init();
})();
