import json
from playwright.sync_api import sync_playwright
B='http://localhost:3000/'; rep={}
with sync_playwright() as pw:
  for bn in ['chromium','firefox']:
    br=getattr(pw,bn).launch()
    for sn,(w,h) in {'desktop':(1440,900),'390':(390,844)}.items():
      pg=br.new_page(viewport={'width':w,'height':h}); errs=[]
      pg.on('console',lambda m: m.type=='error' and errs.append(m.text)); pg.on('pageerror',lambda e: errs.append(str(e)))
      pg.goto(B); pg.wait_for_selector('.no',state='attached'); pg.wait_for_timeout(1500)
      pg.evaluate("document.querySelector('#slow').click()")
      pg.fill('#q','How do I get Gengar?'); pg.press('#q','Enter'); pg.wait_for_selector('.bub .tag',timeout=20000); pg.wait_for_timeout(400)
      ans=pg.eval_on_selector_all('.bub','e=>e.at(-1).innerText')
      if sn=='390': pg.screenshot(path=f'screenshots/{bn}-390-chat-evo.png',full_page=True)
      pg.goto(B+'#/mon/alolan-ninetales'); pg.wait_for_timeout(1500); pg.screenshot(path=f'screenshots/{bn}-{sn}-evo-entry.png',full_page=(sn=='390'))
      ov1=pg.evaluate('document.documentElement.scrollWidth>innerWidth')
      pg.goto(B+'#/list'); pg.wait_for_timeout(800); cnt=pg.inner_text('.count')
      pg.click('button[data-s=evo]'); pg.wait_for_timeout(500); evo=pg.inner_text('#results h3:last-of-type') if pg.query_selector('#results h3') else ''
      pg.screenshot(path=f'screenshots/{bn}-{sn}-list-evo.png',full_page=(sn=='390'))
      ov2=pg.evaluate('document.documentElement.scrollWidth>innerWidth')
      rep[f'{bn}-{sn}']=dict(errs=errs,overflow=[ov1,ov2],count=cnt,evo=evo,ans=ans[:200])
    br.close()
print(json.dumps(rep,indent=1,ensure_ascii=False))
