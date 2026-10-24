// Playwright check of the device layer. Usage: node scripts/device-test.mjs [baseURL]
// Needs `playwright` resolvable (NODE_PATH or local install) and browsers installed.
import { chromium, firefox, webkit } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3000/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const widths = [390, 768, 1440], H = { 390: 844, 768: 1024, 1440: 900 };
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const noX = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
for (const [name, bt] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
  const browser = await bt.launch();
  for (const w of widths) {
    const tag = `${name}-${w}`; console.log(tag);
    const ctx = await browser.newContext({ viewport: { width: w, height: H[w] } });
    await ctx.route('**/api/snooze', r => r.fulfill({ json: { ok: true, answer: 'Dratini lives in the lake. *yawn*', sources: [], model: 'test' } }));
    const p = await ctx.newPage(); const errs = [];
    p.on('console', m => m.type() === 'error' && !/Failed to load resource|404/.test(m.text()) && errs.push(m.text()));
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(BASE, { waitUntil: 'load' });
    ok(await p.isVisible('#boot'), `${tag} first visit shows intro`);
    await p.waitForTimeout(1500);
    const gl = await p.evaluate(() => document.querySelector('#boot').classList.contains('gl'));
    console.log('    3D:', gl);
    if (w === 1440 || w === 390) await p.screenshot({ path: `${OUT}device-${tag}-intro.png` });
    await p.click(gl ? '#power' : '#power');
    if (w === 1440 && name === 'chromium' && gl) { await p.waitForTimeout(900); await p.screenshot({ path: `${OUT}device-${tag}-opening.png` }); }
    await p.waitForSelector('#boot', { state: 'hidden', timeout: 6000 }).catch(() => {});
    ok(!(await p.isVisible('#boot')), `${tag} intro hands off`);
    ok(await p.evaluate(() => !document.querySelector('#bootStage canvas')), `${tag} canvas disposed`);
    ok(await p.evaluate(() => document.activeElement?.id === 'q'), `${tag} focus lands on chat input`);
    await p.waitForFunction(() => document.querySelector('#dev').dataset.led === 'ready', null, { timeout: 8000 }).catch(() => {});
    ok(await p.evaluate(() => document.querySelector('#dev').dataset.led === 'ready'), `${tag} LED ready after dex load`);
    // chat
    await p.fill('#q', 'Where do I catch Dratini?'); await p.press('#q', 'Enter');
    ok(await p.waitForFunction(() => /think|talk|idle/.test(document.querySelector('#dev').dataset.snooze) && document.querySelectorAll('#log .bub').length >= 3, null, { timeout: 5000 }).then(() => true, () => false), `${tag} chat answers`);
    // rapid selection: latest wins
    await p.evaluate(() => { for (const id of ['bulbasaur', 'charmander', 'squirtle', 'pikachu', 'gengar']) location.hash = '#/mon/' + id; });
    await p.evaluate(() => new Promise(r => setTimeout(r, 30)));
    for (const id of ['abra', 'dratini', 'gengar']) await p.evaluate(i => { location.hash = '#/mon/' + i; }, id);
    await p.waitForTimeout(900);
    ok(/gengar/i.test(await p.textContent('#entry')), `${tag} rapid selection ends on Gengar`);
    ok(await p.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.classList?.contains('wipe')).length <= 1), `${tag} at most one wipe running`);
    // search + filter + area + back
    if (w < 1180) await p.click('.tabs button[data-pane=area]');
    await p.fill('#find', 'cemetery'); await p.waitForTimeout(100);
    ok(/Cemetery/i.test(await p.textContent('#results')), `${tag} search finds area`);
    await p.click('.seg button[data-f=pokemon]'); ok(!/Cemetery/i.test(await p.textContent('#results')), `${tag} filter pokemon`);
    await p.click('.seg button[data-f=all]');
    await p.click('#results a[href^="#/area/"]'); await p.waitForTimeout(200);
    ok(await p.isVisible('#areaView'), `${tag} area view opens`);
    await p.click('#areaView .back'); await p.waitForTimeout(200);
    ok(await p.isVisible('#listView'), `${tag} back to list`);
    ok(await noX(p), `${tag} no horizontal scroll`);
    await p.evaluate(() => { location.hash = '#/mon/gengar'; scrollTo(0, 0); }); await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}device-${tag}.png` });
    // keyboard: tab reaches options, opts open with Enter, Esc closes
    const ob = await p.isVisible('#optBtn'); if (ob) { await p.focus('#optBtn'); await p.keyboard.press('Enter'); }
    ok(await p.isVisible('#replay'), `${tag} OPTS opens by keyboard`);
    if (ob) { await p.keyboard.press('Escape'); ok(!(await p.isVisible('#replay')), `${tag} Esc closes OPTS`); }
    // reload: no intro
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(300);
    ok(!(await p.isVisible('#boot')), `${tag} returning visit skips intro`);
    // replay + Esc skip
    if (await p.isVisible('#optBtn')) await p.click('#optBtn'); await p.click('#replay'); await p.waitForTimeout(300);
    ok(await p.isVisible('#boot'), `${tag} replay shows intro`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    ok(!(await p.isVisible('#boot')) && !(await p.evaluate(() => document.querySelector('#dev').inert)), `${tag} Esc skips`);
    ok(errs.length === 0, `${tag} no console errors ${errs.join(' | ')}`);
    await ctx.close();
    // reduced motion
    const c2 = await browser.newContext({ viewport: { width: w, height: H[w] }, reducedMotion: 'reduce' }); const p2 = await c2.newPage();
    await p2.goto(BASE); await p2.waitForTimeout(300);
    ok(!(await p2.isVisible('#boot')), `${tag} reduced motion: no intro`);
    await c2.close();
    // forced WebGL failure
    const c3 = await browser.newContext({ viewport: { width: w, height: H[w] } }); const p3 = await c3.newPage(); const e3 = [];
    p3.on('pageerror', e => e3.push(String(e))); p3.on('console', m => m.type() === 'error' && e3.push(m.text()));
    await p3.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; });
    await p3.goto(BASE); await p3.waitForTimeout(800);
    ok(await p3.isVisible('#lid') && !(await p3.evaluate(() => document.querySelector('#boot').classList.contains('gl'))), `${tag} no-WebGL shows CSS device`);
    if (w === 1440 && name === 'firefox') await p3.screenshot({ path: `${OUT}device-${tag}-nowebgl.png` });
    await p3.click('#lid'); await p3.waitForSelector('#boot', { state: 'hidden', timeout: 3000 }).catch(() => {});
    ok(!(await p3.isVisible('#boot')) && e3.length === 0, `${tag} no-WebGL opens cleanly ${e3.join('|')}`);
    await c3.close();
  }
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} FAILED:\n` + fails.join('\n') : '\nALL PASSED'); process.exit(fails.length ? 1 : 0);
