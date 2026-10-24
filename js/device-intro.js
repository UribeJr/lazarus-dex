/* Lazarus·Dex power-on intro. A left-hinged flip device: the red lid swings open to the left,
   LEDs run their self-test, the LCDs warm up and the camera settles square-on over the live HTML deck,
   then hands off with a short crossfade. Lazy-loaded; the app underneath is already usable.
   Three.js r186 (WebGL2) + GSAP 3.15. Any failure, or no WebGL2, keeps the CSS poster (which is also the fallback). */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let gsapP = null;
const loadGsap = () => gsapP ||= window.gsap ? Promise.resolve(window.gsap) : new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = 'vendor/gsap.3.15.0.min.js'; s.onload = () => ok(window.gsap); s.onerror = no; document.head.appendChild(s);
});
const hasGL2 = () => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } };
const mark = () => { try { localStorage.setItem('lzdex.intro', 'seen'); } catch { /* storage blocked */ } };

export function play({ done, reduced }) {
  const boot = $('#boot'), stage = $('#bootStage'), lid = $('#lid'), power = $('#power'), skipB = $('#skip'), dev = $('#dev');
  let scene = null, tl = null, ended = false, opening = false;
  boot.classList.remove('gl', 'open', 'fade');
  const cleanup = () => {
    tl?.kill(); tl = null; scene?.dispose(); scene = null;
    removeEventListener('keydown', onKey, true); document.removeEventListener('visibilitychange', onVis);
    power.onclick = skipB.onclick = lid.onclick = null;
  };
  const finish = (instant) => {
    if (ended) return; ended = true; mark();
    const out = () => { cleanup(); boot.classList.remove('gl', 'open', 'fade'); done(); $('#q')?.focus({ preventScroll: true }); };
    if (instant || reduced) return out();
    dev.classList.add('warm'); setTimeout(() => dev.classList.remove('warm'), 700);
    boot.classList.add('fade'); setTimeout(out, 360);
  };
  const skip = () => finish(true);
  const activate = () => {
    if (opening || ended) return; opening = true;
    if (reduced) return finish(true);
    if (scene && window.gsap) { tl = scene.timeline(window.gsap, () => finish()); return; }
    boot.classList.add('open'); setTimeout(() => finish(), 650); // CSS lid flip
  };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); skip(); } };
  const onVis = () => { if (!scene) return; if (document.hidden) { scene.pause(); tl?.pause(); } else { scene.resume(); tl?.resume(); } };
  addEventListener('keydown', onKey, true); document.addEventListener('visibilitychange', onVis);
  power.onclick = activate; lid.onclick = activate; skipB.onclick = skip;
  power.focus({ preventScroll: true });
  if (reduced || !hasGL2() || /[?&]nowebgl\b/.test(location.search)) return; // CSS poster path
  Promise.all([loadGsap(), import('../vendor/three-device.r186.min.js'), document.fonts?.load('16px "Press Start 2P"').catch(() => {})])
    .then(([, THREE]) => {
      if (ended || opening) return;
      scene = build(THREE, stage, dev); boot.classList.add('gl');
      scene.canvas.addEventListener('click', activate);
    })
    .catch(e => { console.warn('3D intro unavailable, using CSS device', e); scene?.dispose(); scene = null; boot.classList.remove('gl'); });
}

function rounded(THREE, w, h, r) { // r: [tl,tr,br,bl], shape spans (0,0)-(w,h)
  const s = new THREE.Shape(), [tl, tr, br, bl] = r;
  s.moveTo(bl, 0); s.lineTo(w - br, 0); s.quadraticCurveTo(w, 0, w, br); s.lineTo(w, h - tr); s.quadraticCurveTo(w, h, w - tr, h);
  s.lineTo(tl, h); s.quadraticCurveTo(0, h, 0, h - tl); s.lineTo(0, bl); s.quadraticCurveTo(0, 0, bl, 0); return s;
}
function lidTexture(THREE, w, h) {
  const c = document.createElement('canvas'), k = 512 / w; c.width = 512; c.height = Math.round(h * k); const x = c.getContext('2d');
  const g = x.createRadialGradient(c.width * .2, 0, 10, c.width * .3, c.height * .3, c.width); g.addColorStop(0, '#e0424b'); g.addColorStop(.5, '#C8222C'); g.addColorStop(1, '#9c1720');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * .05})`; x.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1); }
  x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; for (let i = 0; i < 6; i++) { const y = c.height * (.7 + Math.random() * .25); x.beginPath(); x.moveTo(c.width * .05, y); x.lineTo(c.width * (.1 + Math.random() * .1), y + 2); x.stroke(); }
  x.fillStyle = '#8E1219'; x.fillRect(c.width * .06, c.height * .62, c.width * .88, 3);
  const fs = Math.max(10, Math.round(c.width / 22)); x.font = `${fs}px "Press Start 2P", monospace`; x.fillStyle = '#8E1219'; x.fillText('LAZARUS·DEX', c.width * .08 + 2, c.height * .8 + 3); x.fillStyle = '#fff'; x.fillText('LAZARUS·DEX', c.width * .08, c.height * .8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function build(THREE, host, dev) {
  const T = THREE;
  const vw = innerWidth, vh = innerHeight, U = 100, mobile = vw <= 720;
  const R = dev.getBoundingClientRect(), w = R.width / U, h = Math.min(R.height, vh * 1.2) / U;
  // deck centre in world units, relative to viewport centre (final camera looks straight at 0,0,0)
  const toW = (r) => ({ x: (r.left + r.width / 2 - vw / 2) / U, y: -(r.top + r.height / 2 - vh / 2) / U, w: r.width / U, h: r.height / U });
  const D = toW({ left: R.left, top: R.top, width: R.width, height: h * U });
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2)); renderer.setSize(vw, vh, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), fov = 30, zF = (vh / U / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const cam = new THREE.PerspectiveCamera(fov, vw / vh, .1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-6, 8, 14); scene.add(key);
  const glow = new THREE.PointLight(0x4fc3f7, 0, 8); scene.add(glow);
  const disposables = [];
  const mat = (m) => (disposables.push(m), m);
  const geo = (g) => (disposables.push(g), g);
  const radii = mobile ? [.18, .18, .18, .48] : [.28, .28, .28, .9];
  const deck = new THREE.Group(); deck.position.set(D.x, D.y, 0); scene.add(deck);
  const red = mat(new THREE.MeshStandardMaterial({ color: 0xc8222c, roughness: .55, metalness: .05 }));
  const body = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(rounded(THREE, w, h, radii), { depth: .35, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2 })), red);
  body.position.set(-w / 2, -h / 2, -.39); deck.add(body);
  // screens from live DOM rects: bezel + LCD
  const local = r => { const p = toW(r); return { x: p.x - D.x, y: p.y - D.y, w: p.w, h: p.h }; };
  const bezel = mat(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: .8 }));
  const lcds = [];
  $$('.screen').filter(s => s.offsetParent).forEach(s => {
    const b = local(s.getBoundingClientRect()); const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(b.w, b.h)), bezel); m.position.set(b.x, b.y, .002); deck.add(m);
    const l = s.querySelector('.lcd'); if (!l) return; const c = local(l.getBoundingClientRect());
    const lm = mat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x1b2410, roughness: 1 })); const lp = new THREE.Mesh(geo(new THREE.PlaneGeometry(c.w, Math.min(c.h, vh / U))), lm); lp.position.set(c.x, c.y, .004); deck.add(lp); lcds.push(lm);
  });
  // deck lens + LEDs at their DOM positions
  const lensMat = mat(new THREE.MeshPhysicalMaterial({ color: 0x4fc3f7, roughness: .08, clearcoat: 1, transparent: true, opacity: .9, emissive: 0x0d3d66, emissiveIntensity: .4 }));
  const ring = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .4 }));
  const ledMats = [0xff5252, 0xffd740, 0x69f0ae].map(c => mat(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: .3 })));
  const lensEl = dev.querySelector('.lens');
  if (lensEl) { const L = local(lensEl.getBoundingClientRect()); const rr = new THREE.Mesh(geo(new THREE.CylinderGeometry(L.w / 2, L.w / 2, .06, 40)), ring); rr.rotation.x = Math.PI / 2; rr.position.set(L.x, L.y, .03); deck.add(rr);
    const gl = new THREE.Mesh(geo(new THREE.SphereGeometry(L.w * .36, 32, 16)), lensMat); gl.scale.z = .35; gl.position.set(L.x, L.y, .07); deck.add(gl); glow.position.set(D.x + L.x, D.y + L.y, 1); }
  dev.querySelectorAll('.led').forEach((e, i) => { const P = local(e.getBoundingClientRect()); const s = new THREE.Mesh(geo(new THREE.SphereGeometry(P.w / 2, 16, 8)), ledMats[i % 3]); s.scale.z = .5; s.position.set(P.x, P.y, .03); deck.add(s); });
  // lid: hinged on the deck's left edge, covering the deck when closed
  const hinge = new THREE.Group(); hinge.position.set(-w / 2, 0, .02); deck.add(hinge);
  const tex = lidTexture(THREE, w, h); disposables.push(tex);
  const face = mat(new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }));
  const lidM = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(rounded(THREE, w, h, radii), { depth: .22, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 2 })), red);
  lidM.position.set(0, -h / 2, 0); hinge.add(lidM);
  // printed face only on the outside (a plane, so the inner side stays plain red)
  const faceM = new THREE.Mesh(geo(new THREE.ShapeGeometry(rounded(THREE, w, h, radii), 6)), face); faceM.position.z = .2501; lidM.add(faceM);
  const uv = faceM.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w, uv.getY(i) / h);
  const lr = Math.min(w, h) * .11, lx = w * .08 + lr, ly = h / 2 - h * .1 - lr;
  const lring = new THREE.Mesh(geo(new THREE.CylinderGeometry(lr * 1.18, lr * 1.18, .08, 48)), ring); lring.rotation.x = Math.PI / 2; lring.position.set(lx, ly, .29); hinge.add(lring);
  const lglass = new THREE.Mesh(geo(new THREE.SphereGeometry(lr, 40, 20)), lensMat); lglass.scale.z = .4; lglass.position.set(lx, ly, .33); hinge.add(lglass);
  const lidLeds = ledMats.map((m, i) => { const s = new THREE.Mesh(geo(new THREE.SphereGeometry(lr * .16, 16, 8)), m); s.position.set(lx + lr * 1.6 + i * lr * .5, ly + lr * .6, .28); hinge.add(s); return s; });
  // camera: start low-left and pulled back; final = square-on, framing exactly the DOM device
  const look = new THREE.Vector3(D.x, D.y, 0);
  cam.position.set(D.x - w * .18, D.y - h * .35, zF * 1.5); cam.lookAt(look);
  let t0 = performance.now();
  const loop = () => { const t = (performance.now() - t0) / 1000; lensMat.emissiveIntensity = .35 + Math.sin(t * 2.4) * .15; cam.lookAt(look); renderer.render(scene, cam); };
  renderer.setAnimationLoop(loop);
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', onResize);
  const green = new THREE.Color(0x9bbc0f);
  return {
    canvas: renderer.domElement,
    pause() { renderer.setAnimationLoop(null); },
    resume() { renderer.setAnimationLoop(loop); },
    timeline(gsap, onDone) {
      const THREE = T;
      const tl = gsap.timeline({ onComplete: onDone, defaults: { ease: 'power2.inOut' } });
      ledMats.forEach((m, i) => tl.to(m, { emissiveIntensity: 1.6, duration: .08, yoyo: true, repeat: 1 }, i * .12));
      tl.to(ledMats[2], { emissiveIntensity: 1.2, duration: .1 }, .4)
        .to(glow, { intensity: 6, duration: .25, yoyo: true, repeat: 1 }, .1)
        .to(hinge.rotation, { y: -Math.PI * .98, duration: .95 }, .35)
        .to(cam.position, { z: zF * 1.65, y: D.y - h * .1, duration: .6, ease: 'power1.out' }, .35);
      const dark = new THREE.Color(0x1b2410), warm = { k: 0 };
      tl.to(warm, { k: 1, duration: .45, ease: 'steps(5)', onUpdate: () => lcds.forEach(m => m.emissive.lerpColors(dark, green, warm.k)) }, .9);
      tl.to(cam.position, { x: 0, y: 0, z: zF, duration: .85 }, 1.15)
        .to(look, { x: 0, y: 0, duration: .85 }, 1.15)
        .set(lidM, { visible: false }, 1.95)
        .set(lidLeds, { visible: false }, 1.95);
      return tl;
    },
    dispose() {
      renderer.setAnimationLoop(null); removeEventListener('resize', onResize);
      disposables.forEach(d => d.dispose()); renderer.dispose(); renderer.domElement.remove();
    }
  };
}
