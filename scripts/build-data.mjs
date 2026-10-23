// Build-time PokeAPI pull -> static JSON in data/. Never called from the browser.
// Usage: node scripts/build-data.mjs   (responses cached in raw/pokeapi/ so reruns are offline)
import fs from 'node:fs'; import path from 'node:path';
const LOC = JSON.parse(fs.readFileSync(fs.readdirSync('data').filter(f => /^locations\.v1\..*\.json$/.test(f)).sort().map(f => 'data/' + f).pop(), 'utf8'));
const CACHE = 'raw/pokeapi'; fs.mkdirSync(CACHE, { recursive: true });
async function get(url) {
  const f = path.join(CACHE, url.replace(/^https:\/\/pokeapi\.co\/api\/v2\//, '').replace(/\/$/, '').replace(/\//g, '_') + '.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  for (let i = 0; i < 4; i++) { const r = await fetch(url); if (r.ok) { const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j; } if (r.status === 404) return null; await new Promise(s => setTimeout(s, 1000 * (i + 1))); }
  throw new Error('fetch failed ' + url);
}
const API = 'https://pokeapi.co/api/v2/';
// Lazarus display name -> PokeAPI pokemon slug (form-aware). Anything not here is lowercased+dashed.
const SPECIAL = {
  'Hisuian Sligoo': 'sliggoo-hisui', 'Sligoo': 'sliggoo', 'Corsola Galarian': 'corsola-galar', 'Zorua Hisuian': 'zorua-hisui',
  'Unovan Basculin': 'basculin-red-striped', 'White-Striped Basculin': 'basculin-white-striped', 'Lycanroc Day': 'lycanroc-midday', 'Lycanroc Night': 'lycanroc-midnight',
  'Oricorio Baile': 'oricorio-baile', "Oricorio Pa'u": 'oricorio-pau', 'Oricorio Pom-Pom': 'oricorio-pom-pom', 'Oricorio Sensu': 'oricorio-sensu',
  'Pyroar F': 'pyroar-male', 'Pyroar M': 'pyroar-male', 'Tauros Aqua Breed': 'tauros-paldea-aqua-breed', 'Tauros Blaze Breed': 'tauros-paldea-blaze-breed', 'Tauros Combat Breed': 'tauros-paldea-combat-breed',
  'Paldean Wooper': 'wooper-paldea', 'Jangmo-o': 'jangmo-o', 'Type: Null': 'type-null', 'Spiky-Eared Pichu': 'pichu', 'Eternal Flower Floette': 'floette-eternal', 'Shiny Comfey': 'comfey',
  'Mimikyu': 'mimikyu-disguised', 'Gourgeist': 'gourgeist-average', 'Pumpkaboo': 'pumpkaboo-average', 'Ogerpon': 'ogerpon', 'Minior Red Core': 'minior-red', 'Minior Orange Core': 'minior-orange',
  'Minior Yellow Core': 'minior-yellow', 'Minior Green Core': 'minior-green', 'Minior Blue Core': 'minior-blue', 'Minior Indigo Core': 'minior-indigo', 'Minior Violet Core': 'minior-violet',
};
const REG = { Alolan: 'alola', Galarian: 'galar', Hisuian: 'hisui', Paldean: 'paldea' };
function slugFor(n) {
  if (SPECIAL[n]) return SPECIAL[n];
  const m = n.match(/^(Alolan|Galarian|Hisuian|Paldean) (.+)$/); if (m) return m[2].toLowerCase() + '-' + REG[m[1]];
  const f = n.match(/^(Flabebe|Floette) (\w+) Flower$/); if (f) return f[1].toLowerCase() + (f[2] === 'Red' ? '' : '');
  return n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
const formNote = n => (n.match(/(Blue|Orange|Red|White|Yellow) Flower|Pyroar (F|M)$|Core$/) || [])[0] || null;
const pool = async (items, n, fn) => { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; };

const names = new Set(); for (const a of LOC.areas) for (const g of a.groups) for (const e of g.encounters) names.add(e.name); for (const s of LOC.special) names.add(s.name);
const map = {}, missing = [];
const en = arr => (arr || []).find(x => x.language.name === 'en');
const pokemon = {}; const species = {}; const chains = {};
await pool([...names], 8, async n => {
  const p = await get(API + 'pokemon/' + slugFor(n));
  if (!p) { missing.push(n); return; }
  map[n] = { slug: p.name, pokeapiId: p.id, speciesId: +p.species.url.match(/(\d+)\/$/)[1], form: formNote(n) };
  pokemon[p.name] = p;
});
const typeNames = new Set(); Object.values(pokemon).forEach(p => p.types.forEach(t => typeNames.add(t.type.name)));
await pool([...new Set(Object.values(map).map(m => m.speciesId))], 8, async id => { species[id] = await get(API + 'pokemon-species/' + id); });
await pool([...new Set(Object.values(species).map(s => s.evolution_chain.url))], 8, async u => { chains[u] = await get(u); });
const TYPES = {}; for (const t of ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy']) { const j = await get(API + 'type/' + t); const dr = j.damage_relations; TYPES[t] = Object.fromEntries(Object.entries(dr).map(([k, v]) => [k, v.map(x => x.name)])); }
const OVR = JSON.parse(fs.readFileSync('data/lazarus-overrides.json', 'utf8'));
function flat(node, out = [], from = null) {
  const sid = +node.species.url.match(/(\d+)\/$/)[1];
  const d = node.evolution_details[0];
  let how = null; if (d) { const bits = []; if (d.min_level) bits.push('Lv ' + d.min_level); if (d.item) bits.push(d.item.name); if (d.held_item) bits.push('hold ' + d.held_item.name); if (d.trigger.name === 'trade') bits.push('trade'); if (d.min_happiness) bits.push('friendship'); if (d.time_of_day) bits.push(d.time_of_day); if (d.known_move) bits.push('knows ' + d.known_move.name); if (d.location) bits.push('at ' + d.location.name); if (!bits.length) bits.push(d.trigger.name); how = bits.join(', '); }
  out.push({ speciesId: sid, name: node.species.name, from, how }); node.evolves_to.forEach(c => flat(c, out, sid)); return out;
}
const dex = {};
const ITEMWHERE = OVR.items?.where || {};
const flavorOf = s => { const ft = (s.flavor_text_entries || []).filter(x => x.language.name === 'en'); const f = (ft.find(x => /black|white/.test(x.version.name)) || ft.at(-1) || {}).flavor_text; return f ? f.replace(/[\f\n\u00ad]+/g, ' ').replace(/\s+/g, ' ') : null; };
function evoOf(s) {
  let evo = flat(chains[s.evolution_chain.url].chain).map(e => ({ ...e, ...(OVR.evolutions[e.name] ? { how: OVR.evolutions[e.name].how, lazarus: true, note: OVR.evolutions[e.name].note } : {}) }));
  if (OVR.globalRules.tradeToLinkCable) evo = evo.map(e => e.how && /trade/.test(e.how) && !e.lazarus ? { ...e, how: e.how.replace('trade', 'use Linking Cord'), lazarus: true, note: OVR.globalRules.tradeToLinkCable } : e);
  return evo;
}
function entry(id, n, p, s, form, extra = {}) {
  return { id, name: n, slug: p.name, pokeapiId: p.id, speciesId: s.id, nationalNo: s.id, form,
    types: p.types.map(t => t.type.name), stats: Object.fromEntries(p.stats.map(x => [x.stat.name, x.base_stat])),
    abilities: p.abilities.map(a => ({ name: a.ability.name, hidden: a.is_hidden })), height: p.height, weight: p.weight,
    genus: en(s.genera)?.genus || null, flavor: flavorOf(s), evolutions: evoOf(s), ...extra };
}
for (const [n, m] of Object.entries(map)) {
  const id = n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  dex[id] = entry(id, n, pokemon[m.slug], species[m.speciesId], m.form, { obtain: { type: LOC.special.some(x => x.name === n) ? 'special' : 'wild' } });
}
// ---------- evolution-only entries: walk chains from every obtainable entry until nothing new ----------
const REGSUF = ['alola', 'galar', 'hisui', 'paldea'];
const regionOf = slug => (slug.match(/-(alola|galar|hisui|paldea)$/) || [])[1] || (/white-striped/.test(slug) ? 'white-striped' : null);
const REGONLY = Object.fromEntries(Object.entries(OVR.regionalOnly || {}).filter(([k]) => !k.startsWith('_')));
// PokeAPI chains carry no form info: methods for regional evolved forms (standard games, not Lazarus-confirmed)
const REGHOW = { 'sandslash-alola': 'ice-stone', 'ninetales-alola': 'ice-stone', 'arcanine-hisui': 'fire-stone', 'goodra-hisui': 'Lv 50, rain', 'zoroark-hisui': 'Lv 30', 'electrode-hisui': 'leaf-stone', 'obstagoon': 'Lv 35, night', 'perrserker': 'Lv 28', 'cursola': 'Lv 38', 'sneasler': 'hold razor-claw, day', 'basculegion': 'take 294 recoil damage', 'clodsire': 'Lv 20' };
// PokeAPI's location-/game-specific triggers rewritten as plain standard-game methods
const HOWFIX = { magnezone: 'level up in a special magnetic field (or Thunder Stone in newer games)', probopass: 'level up in a special magnetic field (or Thunder Stone in newer games)', vikavolt: 'level up in a special magnetic field (or Thunder Stone in newer games)', leafeon: 'level up near a Moss Rock (or Leaf Stone in newer games)', glaceon: 'level up near an Ice Rock (or Ice Stone in newer games)', sylveon: 'friendship while knowing a Fairy-type move', pawmot: 'level up after walking 1,000 steps (Let\'s Go)', wyrdeer: 'use Psyshield Bash in Agile Style 20 times', basculegion: 'take at least 294 recoil damage without fainting', 'ambipom': 'level up knowing Double Hit', mamoswine: 'level up knowing Ancient Power', tsareena: 'level up knowing Stomp', hydrapple: 'level up knowing Dragon Cheer', kleavor: 'use Black Augurite' };
const REGNAME = { alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' };
const children = (node, sid) => { if (+node.species.url.match(/(\d+)\/$/)[1] === sid) return node.evolves_to; for (const c of node.evolves_to) { const r = children(c, sid); if (r) return r; } return null; };
const have = new Set(Object.values(dex).map(d => d.slug));
const itemNote = how => { const it = Object.keys(ITEMWHERE).find(k => how && how.includes(k)); return it ? `${pretty(it)} in Lazarus: ${ITEMWHERE[it]}` : null; };
function pretty(x) { return String(x).replace(/-/g, ' ').replace(/(^|\s)\w/g, c => c.toUpperCase()); }
let added = 0;
for (let pass = 0; pass < 4; pass++) {
  const queue = Object.values(dex).filter(d => d.obtain);
  for (const par of queue) {
    const kids = children(chains[species[par.speciesId].evolution_chain.url].chain, par.speciesId) || [];
    const preg = regionOf(par.slug);
    for (const k of kids) {
      const cid = +k.species.url.match(/(\d+)\/$/)[1];
      const cs = species[cid] ||= await get(API + 'pokemon-species/' + cid);
      const only = REGONLY[cs.name];
      if (only && only !== preg) continue;            // e.g. normal Meowth does not become Perrserker
      let vslug = cs.varieties.find(v => v.is_default).pokemon.name;
      if (preg && REGSUF.includes(preg) && !only) {
        const rv = cs.varieties.find(v => v.pokemon.name === `${cs.name}-${preg}`);
        if (rv) vslug = rv.pokemon.name; else if (['galar','hisui','paldea'].includes(preg) && Object.values(REGONLY).includes(preg) && kids.some(z => REGONLY[z.species.name] === preg)) continue;
      }
      if (preg && !only && !REGSUF.includes(preg)) continue;
      if (have.has(vslug)) continue;
      const p = pokemon[vslug] ||= await get(API + 'pokemon/' + vslug); if (!p) continue;
      const fe = par.evolutions.find(e => e.speciesId === cid) || {};
      const lazOv = OVR.evolutions[cs.name];
      let how = HOWFIX[vslug] || REGHOW[vslug] || fe.how || k.evolution_details[0]?.trigger?.name || 'level-up';
      const reg = regionOf(vslug);
      const nm = reg && REGNAME[reg] ? `${REGNAME[reg]} ${pretty(cs.name)}` : (en(cs.names)?.name || pretty(cs.name));
      const id = nm.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (dex[id]) continue;
      const confirmed = !!(lazOv || (fe.lazarus && !REGHOW[vslug]));
      dex[id] = entry(id, nm, p, cs, null, { obtain: { type: 'evolution', fromId: par.id, fromName: par.name, how, confirmed, note: confirmed ? (lazOv?.note || fe.note) : 'standard method, not confirmed for Lazarus', item: itemNote(how.toLowerCase().replace(/[\s’']+/g, '-').replace('king-s', 'kings')) } });
      have.add(vslug); added++;
    }
  }
}
// ---------- Mega forms documented on pokemonlazarus.net ----------
for (const [slug, mg] of Object.entries(OVR.megas || {})) {
  if (slug.startsWith('_')) continue; const base = Object.values(dex).find(d => d.slug === mg.base); if (!base) continue;
  const p = pokemon[slug] ||= await get(API + 'pokemon/' + slug); if (!p) continue;
  const id = mg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  dex[id] = entry(id, mg.name, p, species[base.speciesId], 'Mega', { obtain: { type: 'mega', fromId: base.id, fromName: base.name, how: mg.how, confirmed: true, note: 'Source: ' + mg.source } });
}
console.log('evolution entries added:', added);
// encounters grouped by mon
const nameToId = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-');
for (const a of LOC.areas) for (const g of a.groups) for (const e of g.encounters) { const d = dex[nameToId(e.name)]; if (!d) continue; (d.locations ||= []).push({ area: a.id, areaName: a.name, method: g.method, label: g.label, rate: e.rate, ...(e.rod ? { rod: e.rod } : {}) }); }
for (const s of LOC.special) { const d = dex[nameToId(s.name)]; if (d) d.special = s.how; }
const counts = { entries: Object.keys(dex).length, species: new Set(Object.values(dex).map(d => d.speciesId)).size, wild: Object.values(dex).filter(d => d.obtain.type === 'wild').length, special: Object.values(dex).filter(d => d.obtain.type === 'special').length, evolution: Object.values(dex).filter(d => d.obtain.type === 'evolution').length, mega: Object.values(dex).filter(d => d.obtain.type === 'mega').length };
const out = { schema: 2, counts, built: new Date().toISOString().slice(0, 10), locationsSource: LOC.source, locationsFetched: LOC.fetched, pokemon: Object.values(dex).sort((a, b) => a.nationalNo - b.nationalNo || a.name.localeCompare(b.name)), areas: LOC.areas, special: LOC.special, types: TYPES, missing };
fs.writeFileSync('data/dex.json', JSON.stringify(out));
fs.writeFileSync('data/name-map.json', JSON.stringify(map, null, 1));
console.log('mapped', Object.keys(map).length, 'of', names.size, 'missing:', missing);
