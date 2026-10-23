# Lazarus·Dex — the AI Lazarus Pokédex (slow and steady)

A sleepy, retro-handheld Pokédex for the fan game **Pokémon Lazarus** (Ilios region), built for DEV's Hacktoberfest Week 3 challenge (*Slow and Steady*).
Ask **Prof. Snooze** “Where do I catch Dratini?” and he yawns, then slowly types an answer grounded only in real encounter tables.

## Open-source AI at the core
- **Models:** open-weight **`openai/gpt-oss-20b`** (Apache-2.0) on Groq, falling back to **`openai/gpt-oss-120b`**. Override the chain with `SNOOZE_MODELS="model-a,model-b"`.
- **Data-first, never invented.** `api/snooze.js` matches Pokémon and area names in the question against `data/dex.json` and builds a **DEX FACTS** block. The model only rephrases those facts. A grounding check rejects any reply that names an area or a percentage missing from the facts, and the computed answer is served instead.
- **Resting fallback.** With no key, a quota hit, a model error, or the rate limit, Prof. Snooze “rests” and returns the deterministic dex lookup, so the chat always works without `GROQ_API_KEY`.
- **Protection** (best effort, per warm instance): origin allow-list, 5 req/min and 30/day per IP, a 6 h answer cache, and a 300-character question cap.

## The lazy theme
- **SLOW MODE** switch (on by default): Prof. Snooze types slowly and pauses at punctuation. Tap the bubble to wake him up and skip ahead.
- **NAP on the B button** (or press `B`): the screen dims, Z's drift by, and typing pauses until you press any key.
- Sleepy copy throughout, plus an optional **DMG** toggle that recolors sprites into the 4-tone Game Boy green (SVG `feColorMatrix` + discrete posterize).

## Data pipeline (all at build time; the client never calls PokeAPI)
1. `raw/pokemon-locations-2026-10-23.html` is a single fetch of https://pokemonlazarus.net/pokemon-locations/.
2. `python3 scripts/scrape.py` writes `data/locations.v1.2026-10-23.json` (versioned: schema + fetch date + sha256).
3. `node scripts/build-data.mjs` maps every name to a PokeAPI pokémon id (form-aware: Alolan/Galarian/Hisuian/Paldean, Oricorio, Minior, Tauros breeds…). It pulls types, stats, abilities, flavor text, evolution chains and `damage_relations` into `data/dex.json`, and caches the responses in `raw/pokeapi/` (gitignored).
4. `data/lazarus-overrides.json` holds the Lazarus evolution changes. Right now that's the trade → **Linking Cord** rule from the site's Evolution Items page, shown with an `LZ` tag.

Sprites are hotlinked from PokeAPI/sprites: the Gen 5 animated GIF, then the static PNG, then a `?` placeholder. They render at integer scale only (2× or 3×) with `image-rendering: pixelated`.

## Run locally
```
node dev-server.js 3000        # static site + /api/snooze shim
GROQ_API_KEY=... node dev-server.js   # optional; without it you get data-only answers
python3 scripts/shots.py       # Chromium + Firefox, desktop + 390px, console-error check, screenshots/
```
Deploy: a static Vercel site plus a zero-build function `api/snooze.js`. It reads `GROQ_API_KEY`, plus the optional `SNOOZE_MODELS` and `SNOOZE_ORIGINS`.

## Credits
The MIT license covers this project's code only. It does not cover the encounter data, the Pokémon data or the sprites.
- Encounter data: **[pokemonlazarus.net](https://pokemonlazarus.net/pokemon-locations/)**, an independent community resource. *Pokémon Lazarus* is created by **Nemo622**. The site has no explicit license for its data, so this project credits and links it and keeps one dated snapshot. Corrections go to them.
- Pokémon data and sprites: **[PokeAPI](https://pokeapi.co)** / [PokeAPI/sprites](https://github.com/PokeAPI/sprites).
- Fonts: Press Start 2P and VT323 (SIL OFL) via Google Fonts.
- Unofficial fan project. It isn't affiliated with Nintendo, Creatures, Game Freak or The Pokémon Company, and it uses no official logos. Pokémon © its respective owners.
