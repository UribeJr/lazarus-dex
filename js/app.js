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
const state = { slow: true, napping: false, area: null, mon: null, filter: 'all' };

// ---------- sprites: Gen 5 animated GIF -> static PNG -> placeholder; integer scaling only ----------
function spriteSources(p) {
  const s = []; if (p.pokeapiId <= 649) s.push(`${SPR}versions/generation-v/black-white/animated/${p.pokeapiId}.gif`);
  s.push(`${SPR}${p.pokeapiId}.png`); return s;
}
function sprite(p, size) {
  const box = document.createElement('div'); box.className = 'spr ' + size;
  const img = new Image(); img.alt = p.name; img.decoding = 'async'; if (size === 'sm') img.loading = 'lazy';
  const srcs = spriteSources(p); let i = 0;
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight, room = box.clientWidth - 8 || (size === 'big' ? 188 : 40);
    let k = Math.floor(room / Math.max(w, h)); k = size === 'big' ? Math.max(1, Math.min(3, k)) : Math.max(1, Math.min(2, k));
    img.width = w * k; img.height = h * k;
  };
  img.onerror = () => { if (++i < srcs.length) img.src = srcs[i]; else { img.remove(); box.insertAdjacentHTML('beforeend', '<span class="ph" aria-label="no sprite">?</span>'); } };
  img.src = srcs[0]; box.appendChild(img); return box;
}
const iconSrc = p => `${SPR}${p.pokeapiId}.png`;

// ---------- matchups from PokeAPI damage_relations ----------
function matchups(types) {
  const m = Object.fromEntries(TYPES.map(t => [t, 1]));
  for (const t of types) { const d = DEX.types[t]; if (!d) continue;
    d.double_damage_from.forEach(x => m[x] *= 2); d.half_damage_from.forEach(x => m[x] *= .5); d.no_damage_from.forEach(x => m[x] = 0); }
  const g = {}; for (const [t, v] of Object.entries(m)) if (v !== 1) (g[v] ||= []).push(t); return g;
}
const methodLabel = l => l.method === 'fishing' ? 'Fishing' : l.method === 'surfing' ? 'Surfing' : l.method === 'underwater' ? 'Underwater' : 'Land';
const timeLabel = l => l.method === 'day' ? 'Day' : l.method === 'night' ? 'Night' : 'Day + Night';

// ---------- dex entry ----------
function renderEntry(p) {
  const el = $('#entry'); state.mon = p.id; el.innerHTML = '';
  const head = document.createElement('div'); head.className = 'head'; head.appendChild(sprite(p, 'big'));
  const meta = document.createElement('div'); meta.className = 'meta';
  meta.innerHTML = `<div class="no">No.${String(p.nationalNo).padStart(3, '0')} ${esc(p.name.toUpperCase())}</div>
    <div class="types">${p.types.map(t => `<span class="type">${t}</span>`).join('')}</div>
    <div>${esc(p.genus || '')}${p.form ? ' · ' + esc(p.form) : ''} · ${(p.height / 10).toFixed(1)} m · ${(p.weight / 10).toFixed(1)} kg</div>
    <p class="flavor">“${esc(p.flavor || 'No flavor text.')}”</p>`;
  head.appendChild(meta); el.appendChild(head);
  // locations
  const L = (p.locations || []).slice().sort((a, b) => b.rate - a.rate);
  let h = '<h3>▸ LOCATIONS (LAZARUS)</h3>';
  if (L.length) h += `<table><thead><tr><th>AREA</th><th>TIME</th><th>METHOD</th><th>RATE</th></tr></thead><tbody>${L.map(l => `<tr><td><a href="#/area/${l.area}">${esc(l.areaName)}</a></td><td>${timeLabel(l)}</td><td>${methodLabel(l)}${l.rod ? ' · ' + l.rod + ' Rod' : ''}</td><td class="p">${l.rate}%</td></tr>`).join('')}</tbody></table>`;
  else h += '<p class="empty">Not in any wild encounter table.</p>';
  if (p.special) h += `<p><b class="k">SPECIAL:</b> ${esc(p.special)}</p>`;
  // stats + abilities
  const SN = { hp: 'HP', attack: 'ATK', defense: 'DEF', 'special-attack': 'SP.A', 'special-defense': 'SP.D', speed: 'SPE' };
  const tot = Object.values(p.stats).reduce((a, b) => a + b, 0);
  h += `<div class="grid2"><div><h3>▸ BASE STATS (${tot})</h3>${Object.entries(p.stats).map(([k, v]) => `<div class="stat"><span class="k">${SN[k] || k}</span><span>${v}</span><span class="bar"><i style="width:${Math.min(100, v / 1.8)}%"></i></span></div>`).join('')}
    <h3>▸ ABILITIES</h3>${p.abilities.map(a => `<div>${pretty(a.name)}${a.hidden ? ' <span class="k">(H)</span>' : ''}</div>`).join('')}</div>`;
  const mx = matchups(p.types), lab = { 4: '4×', 2: '2×', 0.5: '½×', 0.25: '¼×', 0: '0×' };
  h += `<div><h3>▸ TYPE MATCHUPS (DEF)</h3>${[4, 2, 0.5, 0.25, 0].filter(k => mx[k]).map(k => `<div class="mx"><span class="lbl">${lab[k]}</span>${mx[k].map(t => `<span class="type">${t}</span>`).join('')}</div>`).join('')}</div></div>`;
  // evolutions
  const evo = p.evolutions;
  h += '<h3>▸ EVOLUTION</h3><div class="evo">' + evo.map(e => {
    const inDex = BYSPECIES[e.speciesId]; const name = inDex ? inDex.name : pretty(e.name);
    const st = `<span class="st${inDex ? '' : ' off'}" title="${inDex ? '' : 'Not obtainable in the wild in Lazarus'}">${inDex ? `<a href="#/mon/${inDex.id}">${esc(name)}</a>` : esc(name)}${e.lazarus ? `<span class="lz" title="${esc(e.note)}">LZ</span>` : ''}</span>`;
    return (e.how ? `<span>→ ${esc(pretty(e.how))}</span>` : '') + st;
  }).join(' ') + '</div>';
  if (evo.some(e => e.lazarus)) h += '<p class="empty" style="font-size:18px">LZ = Lazarus override: trade evolutions use the Linking Cord (Sofos City Green Shard Exchange).</p>';
  h += `<p class="verified">✓ DATA · pokemonlazarus.net (${esc(DEX.locationsFetched)}) · PokeAPI</p>`;
  el.insertAdjacentHTML('beforeend', h);
  el.scrollTop = 0; $$('.list a').forEach(a => a.toggleAttribute('aria-current', a.dataset.id === p.id));
}

// ---------- area + list ----------
function renderArea(a) {
  state.area = a.id; $('#areaCap').textContent = `▣ AREA ${String(a.index).padStart(2, '0')}`;
  const s = $('#side');
  const grp = g => `<h3>${g.method === 'day' ? '☀' : g.method === 'night' ? '☾' : g.method === 'fishing' ? '⌇' : '≈'} ${esc(g.label.toUpperCase())}</h3><ul class="list">${g.encounters.map(e => { const p = BY[nid(e.name)]; return `<li><a href="#/mon/${p ? p.id : ''}" data-id="${p ? p.id : ''}">${p ? `<img src="${iconSrc(p)}" alt="" loading="lazy" width="32" height="32">` : ''}<span style="flex:1">${esc(e.name)}${e.rod ? ` <i>${e.rod}</i>` : ''}</span><b>${e.rate}%</b></a></li>`; }).join('')}</ul>`;
  const day = a.groups.find(g => g.method === 'day'), night = a.groups.find(g => g.method === 'night'), rest = a.groups.filter(g => g !== day && g !== night);
  s.innerHTML = `<button class="back" data-go="list">◂ ALL AREAS / DEX</button><h2>${esc(a.name.toUpperCase())}</h2>
    <div class="cols">${day ? '<div>' + grp(day) + '</div>' : ''}${night ? '<div>' + grp(night) + '</div>' : ''}</div>${rest.map(grp).join('')}`;
  s.scrollTop = 0; hideBrokenIcons(s);
}
function renderList() {
  state.area = null; $('#areaCap').textContent = '▣ DEX LIST & AREAS';
  const s = $('#side');
  s.innerHTML = `<input class="search" id="find" type="search" placeholder="Search Pokémon or area…" aria-label="Search Pokémon or area">
    <div class="seg" role="group" aria-label="List">${['all', 'pokemon', 'areas'].map(f => `<button data-f="${f}" aria-pressed="${state.filter === f}">${f.toUpperCase()}</button>`).join('')}</div><div id="results"></div>`;
  const draw = () => {
    const q = $('#find').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const m = x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
    const areas = state.filter !== 'pokemon' ? DEX.areas.filter(a => !q || m(a.name)) : [];
    const mons = state.filter !== 'areas' ? DEX.pokemon.filter(p => !q || m(p.name) || String(p.nationalNo) === q || p.types.some(t => t === q)) : [];
    $('#results').innerHTML = (areas.length ? `<h3>▸ AREAS (${areas.length})</h3><ul class="list">${areas.map(a => `<li><a href="#/area/${a.id}"><span>${esc(a.name)}</span><b>${a.groups.reduce((n, g) => n + g.encounters.length, 0)}</b></a></li>`).join('')}</ul>` : '') +
      (mons.length ? `<h3>▸ POKÉMON (${mons.length})</h3><ul class="list">${mons.slice(0, 400).map(p => `<li><a href="#/mon/${p.id}" data-id="${p.id}"><img src="${iconSrc(p)}" alt="" loading="lazy" width="32" height="32"><span style="flex:1">${esc(p.name)}</span><b>${String(p.nationalNo).padStart(3, '0')}</b></a></li>`).join('')}</ul>` : '') ||
      '<p class="empty">Nothing here… even the Slakoth gave up looking.</p>';
    hideBrokenIcons($('#results'));
  };
  $('#find').addEventListener('input', draw);
  $$('.seg button', s).forEach(b => b.onclick = () => { state.filter = b.dataset.f; $$('.seg button', s).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
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
  } catch { j = { ok: false, resting: true, answer: "Prof. Snooze is offline (resting). Search the dex list on the right instead!", sources: [] }; }
  const src = (j.sources || []).length ? `<span class="src">${j.sources.map(s => `<a href="#/${s.kind}/${esc(s.id)}">▸ ${esc(s.t)}</a>`).join('')}</span>` : '';
  const tag = `<span class="tag">${j.resting ? 'RESTING · ' : ''}${j.model && j.model !== 'computed' ? esc(j.model.replace('openai/', '')) : j.model === 'computed' ? 'DEX LOOKUP' : ''}${j.cached ? ' · CACHED' : ''}</span>`;
  $('#status').textContent = state.slow ? 'typing… slowly (tap to skip)' : '';
  await typeOut(b, j.answer, src + tag);
  $('#status').textContent = 'Ask about any Pokémon or area. Prof. Snooze only knows the Lazarus tables.';
  if (j.sources?.[0] && innerWidth > 720) location.hash = `#/${j.sources[0].kind}/${j.sources[0].id}`;
}

// ---------- nap / slow / dmg ----------
function nap(on) { state.napping = on; $('#napscreen').hidden = !on; document.body.classList.toggle('nap', on); }
function route() {
  const [, kind, id] = location.hash.match(/^#\/(mon|area)\/([\w-]+)/) || [];
  if (kind === 'mon' && BY[id]) { renderEntry(BY[id]); show('dex'); }
  else if (kind === 'area' && AREAS[id]) { renderArea(AREAS[id]); show('area'); }
  else if (location.hash === '#/list') { renderList(); show('area'); }
}
function show(p) { $$('.tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.pane === p)); $$('.screen').forEach(s => s.classList.toggle('on', s.dataset.pane === p)); }

async function init() {
  show('chat');
  $$('.tabs button').forEach(b => b.onclick = () => show(b.dataset.pane));
  $('#slow').onchange = e => { state.slow = e.target.checked; $('#slowLbl').textContent = state.slow ? 'ON' : 'OFF'; if (!state.slow && typing) typing.finish(); };
  $('#dmgT').onchange = e => document.body.classList.toggle('dmg', e.target.checked);
  $('#nap').onclick = () => nap(true); $('#napscreen').onclick = () => nap(false);
  addEventListener('keydown', e => { if (state.napping) { nap(false); e.preventDefault(); return; } if ((e.key === 'b' || e.key === 'B') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) nap(true); });
  $('#ask').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (!q) return; $('#q').value = ''; ask(q); };
  $('#side').addEventListener('click', e => { if (e.target.closest('[data-go=list]')) { location.hash = '#/list'; } });
  const r = await fetch('data/dex.json'); DEX = await r.json();
  DEX.pokemon.forEach(p => { BY[p.id] = p; if (!BYSPECIES[p.speciesId]) BYSPECIES[p.speciesId] = p; }); DEX.areas.forEach(a => AREAS[a.id] = a);
  const hello = bubble('', '');
  hello.textContent = "*yaaawn*… oh, a trainer. I'm Prof. Snooze. I know every wild encounter in the Ilios region — slowly. Ask me something:";
  hello.insertAdjacentHTML('beforeend', `<span class="chips">${['Where do I catch Dratini?', "What's in Pythios Cemetery?", 'Where is Gengar?'].map(q => `<button class="chip" type="button">${esc(q)}</button>`).join('')}</span>`);
  $$('.chip', hello).forEach(c => c.onclick = ev => { ev.stopPropagation(); ask(c.textContent); });
  renderList();
  if (!location.hash || !/^#\/(mon|area)/.test(location.hash)) renderEntry(BY.dratini); else route();
  if (!location.hash) show('chat');
  addEventListener('hashchange', route);
  if (location.hash && innerWidth > 720 && /area/.test(location.hash)) renderEntry(BY.dratini);
}
init();
})();
