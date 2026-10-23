// /api/snooze — "Prof. Snooze", the sleepy Lazarus Dex professor.
// Data-first: every fact comes from data/dex.json (pokemonlazarus.net encounters + build-time PokeAPI).
// Open-weight models on Groq (gpt-oss-20b -> gpt-oss-120b) only rephrase those facts; if they stray, we use the computed answer.
// Protection is best effort: in-memory limits/caches live per warm serverless instance only.
const DEX = require('../data/dex.json');

const MODELS = (process.env.SNOOZE_MODELS || 'openai/gpt-oss-20b,openai/gpt-oss-120b').split(',').map(s => s.trim()).filter(Boolean);
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_Q = 300, PER_MIN = 5, PER_DAY = 30;
const ALLOWED = [/^https:\/\/lazarus-dex\.vercel\.app$/, /^https:\/\/lazarus-dex-[a-z0-9-]+-enrique-uribe-s-projects\.vercel\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ...(process.env.SNOOZE_ORIGINS || '').split(',').filter(Boolean).map(o => new RegExp('^' + o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))];

// ---------- lookup ----------
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const MONS = DEX.pokemon.map(p => ({ p, n: norm(p.name) })).sort((a, b) => b.n.length - a.n.length);
const AREAS = DEX.areas.map(a => ({ a, n: norm(a.name), base: norm(a.name.replace(/\s*\(.*\)|\s+(B?F\d+)$/, '')) }));
const SPECIES = new Map(); for (const p of DEX.pokemon) if (!SPECIES.has(p.speciesId)) SPECIES.set(p.speciesId, p);
const ALLNAMES = new Set(DEX.pokemon.map(p => norm(p.name)));
// species names from PokeAPI evolution chains that are NOT obtainable in Lazarus
const EVO_ONLY = new Set(); for (const p of DEX.pokemon) for (const e of p.evolutions) if (!ALLNAMES.has(norm(e.name))) EVO_ONLY.add(norm(e.name.replace(/-/g, ' ')));

function find(q) {
  let nq = ' ' + norm(q) + ' ';
  const mons = [], areas = [];
  for (const { p, n } of MONS) if (nq.includes(' ' + n + ' ')) { mons.push(p); nq = nq.replace(' ' + n + ' ', ' '); }
  for (const { a, n, base } of AREAS) if (nq.includes(' ' + n + ' ') || (base.length > 3 && nq.includes(' ' + base + ' '))) areas.push(a);
  const missing = [...EVO_ONLY].filter(n => nq.includes(' ' + n + ' '));
  return { mons: mons.slice(0, 3), areas: areas.slice(0, 3), missing };
}
const how = l => l.method === 'fishing' ? `${l.rod} Rod` : l.method === 'surfing' ? 'Surf' : l.method === 'underwater' ? 'Underwater' : `Land (${l.method})`;
function monFacts(p) {
  const L = (p.locations || []).slice().sort((a, b) => b.rate - a.rate);
  const evo = p.evolutions.filter(e => e.how).map(e => `${e.name} via ${e.how}${e.lazarus ? ' [Lazarus]' : ''}`).join('; ');
  return `${p.name} (#${p.nationalNo}, ${p.types.join('/')})` +
    (L.length ? ` — wild: ${L.map(l => `${l.areaName}: ${how(l)} ${l.rate}%`).join('; ')}` : ' — NOT in any wild encounter table') +
    (p.special ? ` — special: ${p.special}` : '') + (evo ? ` — evolutions: ${evo}` : '');
}
function areaFacts(a) { return `${a.name}: ` + a.groups.map(g => `${g.label}: ` + g.encounters.map(e => `${e.name} ${e.rate}%${e.rod ? ' ' + e.rod + ' Rod' : ''}`).join(', ')).join(' | '); }
const src = (mons, areas) => [...mons.map(p => ({ kind: 'mon', id: p.id, t: p.name })), ...areas.map(a => ({ kind: 'area', id: a.id, t: a.name }))];

function computed(q, f) {
  const yawn = ['*yaaawn*… ', '*stretches*… ', 'mm… ', ''][Math.floor(norm(q).length % 4)];
  if (f.mons.length) {
    const parts = f.mons.map(p => {
      const L = (p.locations || []).slice().sort((a, b) => b.rate - a.rate);
      if (!L.length) return p.special ? `${p.name} isn't in the wild tables — ${p.special}` : `${p.name} isn't in any Lazarus wild encounter table I have.`;
      const top = L.slice(0, 6).map(l => `${l.areaName} (${how(l)}, ${l.rate}%)`);
      return `${p.name}: ${top.join(', ')}${L.length > 6 ? ` …and ${L.length - 6} more spots in the dex entry` : ''}.`;
    });
    return yawn + 'no rush, trainer. ' + parts.join(' ') + ' Take a nap between encounters.';
  }
  if (f.areas.length) return yawn + f.areas.map(a => `${a.name} has ${a.groups.map(g => `${g.label.toLowerCase()} (${g.encounters.slice(0, 4).map(e => `${e.name} ${e.rate}%`).join(', ')}${g.encounters.length > 4 ? '…' : ''})`).join('; ')}.`).join(' ');
  if (f.missing.length) return yawn + f.missing.map(n => {
    const fam = DEX.pokemon.find(p => p.evolutions.some(e => norm(e.name.replace(/-/g, ' ')) === n));
    const e = fam && fam.evolutions.find(e => norm(e.name.replace(/-/g, ' ')) === n);
    const pre = e && fam.evolutions.find(x => x.speciesId === e.from);
    return pre ? `${n[0].toUpperCase() + n.slice(1)} isn't in any wild table — evolve it from ${pre.name[0].toUpperCase() + pre.name.slice(1)} (${e.how}).` : `${n} isn't in my Lazarus encounter data.`;
  }).join(' ');
  return null;
}

// ---------- protection (same pattern as the Unbound Professor) ----------
const INSTANCE = Math.random().toString(36).slice(2, 8);
const hits = new Map(), cache = new Map();
function limited(ip) {
  const now = Date.now(); const h = hits.get(ip) || { min: [], day: [] };
  h.min = h.min.filter(t => now - t < 60e3); h.day = h.day.filter(t => now - t < 864e5);
  if (h.min.length >= PER_MIN) return 'minute';
  if (h.day.length >= PER_DAY) return 'day';
  h.min.push(now); h.day.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return null;
}

const SYS = `You are "Prof. Snooze", a very sleepy, slow, kind Pokémon professor in a fan-made Pokémon Lazarus dex (Ilios region).
Rules:
- Use ONLY the DEX FACTS given. Never invent Pokémon, areas, rates, rods or methods. If the facts don't answer it, say you only know the Lazarus encounter tables.
- Every area or rate you mention must appear verbatim in the facts. Prefer the highest rates first.
- 2–4 short sentences, plain text, no markdown. Be lazy and cozy (a yawn, a nap joke) but accurate.
- Off-topic questions: one sleepy sentence steering back to Lazarus Pokémon and areas.`;

async function askGroq(messages) {
  const key = process.env.GROQ_API_KEY; if (!key) throw Object.assign(new Error('no key'), { code: 'nokey' });
  let last;
  for (const model of MODELS) {
    const body = { model, messages, temperature: 0.2, max_completion_tokens: 600 };
    if (model.startsWith('openai/gpt-oss')) { body.reasoning_effort = 'low'; body.include_reasoning = false; }
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(GROQ_URL, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      if (!r.ok) { last = Object.assign(new Error('groq ' + r.status), { code: r.status }); continue; }
      const j = await r.json(); const text = (j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (!text) { last = new Error('empty'); continue; }
      return { text, model };
    } catch (e) { last = e; } finally { clearTimeout(tm); }
  }
  throw last || new Error('all models failed');
}
// Guard: reject LLM output that names an area or a percentage not present in the facts.
function grounded(text, facts) {
  const nf = norm(facts), nt = norm(text);
  for (const { n } of AREAS) if (nt.includes(n) && !nf.includes(n)) return false;
  for (const m of text.matchAll(/(\d{1,3})\s?%/g)) if (!new RegExp('\\b' + m[1] + '%').test(facts)) return false;
  return true;
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const refOrigin = (() => { try { return new URL(req.headers.referer || '').origin; } catch { return ''; } })();
  const okOrigin = [origin, refOrigin].some(o => o && ALLOWED.some(r => r.test(o)));
  if (origin && ALLOWED.some(r => r.test(origin))) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  if (!okOrigin) return res.status(403).json({ ok: false, error: 'origin not allowed' });

  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const q = String(body.q || '').replace(/\s+/g, ' ').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'empty question' });
  if (q.length > MAX_Q) return res.status(413).json({ ok: false, error: `Keep questions under ${MAX_Q} characters.` });
  const f = find(q), sources = src(f.mons, f.areas);
  const base = computed(q, f);
  const ckey = norm(q), c = cache.get(ckey);
  if (c && Date.now() - c.at < 6 * 3600e3) return res.status(200).json({ ...c.body, cached: true });
  const put = out => { cache.set(ckey, { at: Date.now(), body: out }); if (cache.size > 500) cache.delete(cache.keys().next().value); return res.status(200).json(out); };

  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
  const lim = limited(ip); res.setHeader('X-Snooze-Instance', INSTANCE);
  if (lim) return res.status(429).json({ ok: false, resting: true, reason: 'rate', answer: (lim === 'minute' ? 'Zzz… slow and steady, trainer — 5 questions a minute. ' : "That's enough questions for today. Prof. Snooze is napping until tomorrow. ") + (base ? 'Here is what the dex says: ' + base : ''), sources });

  if (!f.mons.length && !f.areas.length) {
    if (base) return put({ ok: true, answer: base, sources, model: 'computed' });
    return put({ ok: true, answer: "*yawn*… I only know Lazarus Pokémon and areas from pokemonlazarus.net. Try “Where do I catch Dratini?” or “What's in Pythios Cemetery?”", sources: [], model: null });
  }
  const forced = req.headers['x-snooze-test'] === 'fallback' && process.env.VERCEL_ENV !== 'production';
  if (forced || body.mode === 'data') return res.status(200).json({ ok: !forced, resting: forced, reason: forced ? 'forced' : undefined, answer: (forced ? "Prof. Snooze is resting — here's the raw dex lookup: " : '') + base, sources, model: 'computed' });

  const facts = [...f.mons.map(monFacts), ...f.areas.map(areaFacts)].join('\n');
  const messages = [{ role: 'system', content: SYS }, { role: 'user', content: `DEX FACTS (pokemonlazarus.net, fetched ${DEX.locationsFetched}):\n${facts}\n\nQUESTION: ${q}` }];
  try {
    const { text, model } = await askGroq(messages);
    if (!grounded(text, facts)) return put({ ok: true, answer: base, sources, model: 'computed', note: 'model output failed grounding check' });
    return put({ ok: true, answer: text, sources, model });
  } catch (e) {
    return res.status(200).json({ ok: false, resting: true, reason: e.code === 'nokey' ? 'nokey' : (String(e.code) === '429' ? 'quota' : 'error'), answer: "Prof. Snooze is resting — here's the raw dex lookup: " + base, sources, model: 'computed' });
  }
};
module.exports._find = find; module.exports._computed = computed;
