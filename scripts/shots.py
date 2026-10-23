# Browser smoke test + screenshots: python3 scripts/shots.py  (needs dev-server on :3000)
import sys, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:3000/'
SIZES = {'desktop': (1440, 900), 'mobile': (390, 844)}
report = {}
with sync_playwright() as pw:
    for bname in ['chromium', 'firefox']:
        br = getattr(pw, bname).launch()
        for sname, (w, h) in SIZES.items():
            pg = br.new_page(viewport={'width': w, 'height': h})
            errs = []
            pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(BASE); pg.wait_for_selector('.no', state='attached'); pg.wait_for_timeout(2500)
            # ask with slow mode OFF so the screenshot shows the full answer
            pg.click('#slow') if sname == 'desktop' else pg.evaluate("document.querySelector('#slow').click()")
            pg.fill('#q', 'Where do I catch Dratini?'); pg.press('#q', 'Enter')
            pg.wait_for_selector('.bub .tag', timeout=20000); pg.wait_for_timeout(500)
            if sname == 'desktop':
                pg.goto(BASE + '#/mon/dratini'); pg.wait_for_timeout(1500)
                pg.screenshot(path=f'screenshots/{bname}-desktop-home.png')
                pg.goto(BASE + '#/area/pythios-cemetery'); pg.wait_for_timeout(1500)
                pg.screenshot(path=f'screenshots/{bname}-desktop-area.png')
                pg.evaluate("document.querySelector('#dmgT').click()"); pg.goto(BASE + '#/mon/gastly'); pg.wait_for_timeout(1500)
                pg.screenshot(path=f'screenshots/{bname}-desktop-dmg-gastly.png')
            else:
                pg.screenshot(path=f'screenshots/{bname}-390-chat.png', full_page=True)
                pg.goto(BASE + '#/mon/dratini'); pg.wait_for_timeout(1500); pg.screenshot(path=f'screenshots/{bname}-390-dex.png', full_page=True)
                pg.goto(BASE + '#/area/pythios-cemetery'); pg.wait_for_timeout(1000); pg.screenshot(path=f'screenshots/{bname}-390-area.png', full_page=True)
                pg.goto(BASE + '#/list'); pg.wait_for_timeout(500); pg.fill('#find', 'cemet'); pg.wait_for_timeout(300); pg.screenshot(path=f'screenshots/{bname}-390-search.png')
                ow = pg.evaluate('document.documentElement.scrollWidth')
                errs += [f'horizontal overflow {ow}px'] if ow > w else []
            # sprite integer scale check
            sc = pg.evaluate("[...document.querySelectorAll('.spr.big img')].map(i=>[i.naturalWidth,i.width])")
            report[f'{bname}-{sname}'] = {'errors': errs, 'sprite(natural,rendered)': sc}
            pg.close()
        br.close()
print(json.dumps(report, indent=1))
