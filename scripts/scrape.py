#!/usr/bin/env python3
"""Parse the pokemonlazarus.net encounter page (fetched once, saved under raw/) into versioned JSON.
Usage: python3 scripts/scrape.py raw/pokemon-locations-YYYY-MM-DD.html"""
import re, json, sys, html, hashlib, os
src = sys.argv[1] if len(sys.argv) > 1 else sorted(f for f in os.listdir('raw') if f.endswith('.html'))[-1]
if not src.startswith('raw/') and not os.path.exists(src): src = 'raw/' + src
h = open(src, encoding='utf-8').read()
clean = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower().replace('é', 'e')).strip('-')
areas = []
for m in re.finditer(r'<details class="pl-location" data-location="([^"]*)">(.*?)</details>', h, re.S):
    body = m.group(2)
    name = clean(re.search(r'pl-location__name">(.*?)</span>', body, re.S).group(1))
    idx = int(clean(re.search(r'pl-location__index">(.*?)</span>', body, re.S).group(1)))
    groups = []
    for g in re.finditer(r'<div class="pl-encounter-group" data-method="(\w+)"><h3>(.*?)</h3><div class="pl-encounter-list">(.*?)</div></div>', body, re.S):
        method, label, lst = g.group(1), clean(g.group(2)), g.group(3)
        encs = []
        for e in re.finditer(r'<span><strong>(.*?)</strong>\s*(\d+)%\s*(?:<em>(.*?)</em>)?\s*</span>', lst, re.S):
            enc = {'name': clean(e.group(1)), 'rate': int(e.group(2))}
            if e.group(3): enc['rod'] = clean(e.group(3)).replace(' Rod', '')
            encs.append(enc)
        groups.append({'method': method, 'label': label, 'encounters': encs})
    areas.append({'id': slug(name), 'index': idx, 'name': name, 'groups': groups})
special = [{'name': clean(s.group(1)), 'how': clean(s.group(2))} for s in re.finditer(r'<article class="pl-special-card"[^>]*><h3>(.*?)</h3><p>(.*?)</p></article>', h, re.S)]
out = {'schema': 1, 'source': 'https://pokemonlazarus.net/pokemon-locations/', 'credit': 'pokemonlazarus.net (Pokémon Lazarus by Nemo622)',
       'fetched': re.search(r'(\d{4}-\d{2}-\d{2})', src).group(1), 'sha256': hashlib.sha256(h.encode()).hexdigest()[:16], 'areas': areas, 'special': special}
os.makedirs('data', exist_ok=True)
p = f"data/locations.v1.{out['fetched']}.json"
json.dump(out, open(p, 'w'), ensure_ascii=False, indent=1)
n = sum(len(g['encounters']) for a in areas for g in a['groups'])
print(p, len(areas), 'areas', n, 'encounter rows', len(special), 'special')
