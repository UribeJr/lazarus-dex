# Lazarus·Dex — device upgrade plan

> "A working Lazarus Pokédex you can hold in your browser."

Built on Enrique's commit `171e4a7`. His sizing and layout stay as they are: the narrow chat column, the widest entry column, `.dev.wide` and the grid areas, the smaller paddings, the 21px/1.25 LCD type, the lighter scanlines, the 44px input and 34px chip targets, `--pale`, the focus-visible rules and the OPTS menu.

## 1. Device concept: a left-hinged flip Pokédex

The device is a red lid that swings open to the left on a vertical hinge, like the anime Pokédex. Under the lid is a dark control deck with three recessed green LCDs. The deck is the live HTML app.

**Why this one:**
- **Hinged.** The three screens sit side by side in a wide row, so a vertical hinge on the left edge folds the lid fully out of frame. A top hinge would swing the lid toward the camera and cover the screens.
- **Not unfolding.** An unfolding device would need three separately animated panels whose final positions change at every breakpoint. That means a lot of geometry for little extra payoff.
- **Not a plain power-on.** A simple boot screen would feel convincing enough, but it loses the sense of a physical object. Enrique's brief asks for exactly that, and the Unbound journal shows it works.
- **One rule on every viewport.** The lid covers whatever deck the current breakpoint shows: three screens on desktop, entry plus a side screen on tablet, one screen on phone. The 3D deck is measured from the real DOM rects (`.dev`, `.screen`, `.lens`) at intro time. The final camera frame therefore lands on the same pixels as the HTML device, and the handoff is a short crossfade.

**How the geometry maps to the UI:**

| 3D part | HTML counterpart |
|---|---|
| Lid front: lens, 3 LEDs, embossed title | Activation target only; folds out of view |
| Deck plate | `#dev` (red shell, rounded 28/28/28/90 corners) |
| 3 recessed LCD planes | `.screen[data-pane=chat|dex|area]` rects |
| Deck lens and LEDs | `.top .lens` and `.led` (live indicators after handoff) |
| Hinge knuckles on the left edge | `.dev::before` knuckles |
| Speaker slots | `.spk` grille |

## 2. Storyboard

1. **Arrival, first visit with motion allowed.** The full app renders and loads underneath at once (data fetch, list and entry). Nothing waits for the intro. A dark overlay shows the closed device: a CSS poster first, replaced by the 3D lid once Three.js has loaded lazily. The overlay has a **POWER** button and a **SKIP INTRO** button. Clicking the lens, the device, Enter or Space also activates it. Esc skips.
2. **Activation, about 2.4 s.** The LEDs blink red, yellow, green. The lid swings open to the left while the camera pulls back slightly. The LCD planes warm up from dark olive to LCD green with a flicker. The camera dollies square-on until the deck matches the DOM device. The overlay crossfades away, `#dev` gets a one-shot `.warm` LCD flicker and focus moves to the chat input. The intro is marked seen in `localStorage` (`lzdex.intro=seen`).
3. **Returning visitors, reduced-motion users and skippers.** No overlay. The working view shows immediately, and the head script decides this before first paint. **OPTS → REPLAY INTRO** plays it again at any time.
4. **No WebGL.** The CSS poster is the fallback. Tapping it plays a CSS lid flip (or an instant reveal under reduced motion).
5. **Normal use.**
   - The **lens** reflects Snooze's state: idle shimmer, a *thinking* pulse while the request is in flight, a *talking* flicker while typing, and an *error* tint when he is resting or offline.
   - The **LEDs** reflect app state: green means dex loaded and ready, yellow blinks while busy (dex loading or a question in flight), red means offline, resting or napping.
   - **Buttons** press down with collapsing shadows.
   - **Selecting a Pokémon** plays a short LCD wipe across the entry, a stepped sprite reveal and stat bars growing from zero. Every render restarts the effect, so rapid selections always resolve to the latest one.
   - **Evolution links and area views** get a restrained single-line scan.
   - **Optional sound** (tiny Web Audio blips) is off by default. It only plays after a user gesture, and the OPTS toggle is saved.
6. **Mobile.** One screen at a time with the existing sticky CHAT/DEX/BROWSE tabs, which act as the persistent compact mode controls. Same intro with a cheaper renderer (DPR ≤ 1.5, no antialias). Search text, filters, chat log, the selected Pokémon and per-pane scroll survive mode changes. No pointer tilt anywhere on reading surfaces.

## 3. Who does what

| Layer | Job |
|---|---|
| **Three.js r186** (`vendor/three-device.r186.min.js`, tree-shaken ESM bundle, loaded only for the intro) | Lid, deck, lens, LEDs and LCD planes. Uses `renderer.setAnimationLoop` (recommended by the docs), paused on `visibilitychange`, then `renderer.dispose()` plus geometry, material and texture disposal at handoff. WebGL2 only (WebGL1 support was dropped in r163), so any failure falls back to CSS. |
| **GSAP 3.15** (`vendor/gsap.3.15.0.min.js`, loaded only for the intro) | The single intro timeline: LEDs, lid, warm-up, camera, crossfade. Killed on skip, finish and hide. Not used for app UI, so nothing depends on it. |
| **CSS** | Shell depth, recessed bezels, lens and LED state styles, button presses, speaker, hinge, wear, `.warm`, the selection wipe, sprite reveal, stat bars, the CSS poster and fallback flip. Reduced motion uses the existing global kill switch. |
| **HTML** | Every piece of text, search, table, chat, link and control, exactly as before. The overlay is a labelled `role=dialog` with real buttons. `#dev` is `inert` only while the overlay is open. |

## 4. Components and files

- `index.html`: a head script that sets `html.intro` before paint; the `#boot` overlay (poster lid, canvas host, POWER, SKIP); speaker and hinge spans; OPTS gains REPLAY INTRO and SOUND.
- `css/app.css`: Enrique's rules unchanged. Device layer appended (`/* ===== device layer ===== */`).
- `js/app.js`: small hooks only.
  - `setSnooze(state)` drives the lens and LEDs from `ask()`.
  - `setBusy` / `setReady` follow dex loading.
  - Nap drives the red LED.
  - `lcdWipe()` runs after `renderEntry`; area and list renders get a scan.
  - `blip()` handles sound.
  - Intro gating and replay use `import('./device-intro.js')`.
- `js/device-intro.js` (new ES module): `play({ replay })`. Loads GSAP and Three, builds the scene from DOM measurements, runs the timeline, falls back to CSS on any error, cleans up.
- `vendor/`: Three (MIT, license copied) and GSAP (standard no-charge license).

## 5. Assets and dependencies

No images or models. The lid texture is a procedural `CanvasTexture`: red plastic, faint scuffs, embossed "LAZARUS·DEX" in Press Start 2P. Pixel sprites stay as they are, from PokeAPI. No build step: the vendored files are static, which matches the current Vercel config (`buildCommand: ""`).

## 6. Open decisions and assumptions

- **A1.** The intro plays once per browser. Skipping counts as seen. Replay lives in OPTS.
- **A2.** First-time visitors with reduced motion get no intro at all. Replay under reduced motion is an instant reveal.
- **A3.** Sound defaults to **off** (muted). It's a toggle, not an auto-play.
- **A4.** The HTML deck has no 3D layer behind it. A persistent WebGL shell would cost battery and add complexity for almost no gain once the device is open.
- **A5.** The tablet and phone intro uses the same lid over that breakpoint's visible deck, not a different device.
- **Q1 (open).** Should the lens in the working view do anything when clicked, such as focusing the chat? For now it is decorative and `aria-hidden`.
- **Q2 (open).** Sound palette: placeholder square-wave blips for now. Real samples would need licensing.

## 7. Phases

- **Phase 1 (this commit).** Activate, enter the guide, select a Pokémon:
  - intro with skip, remember and replay; reduced motion; CSS/WebGL fallback
  - responsive device shell, button presses, lens and LED states, LCD wipe with latest-wins
  - cheap extras: area and evolution scan, optional sound with saved mute
- **Phase 2.** Polish the 3D: subtle normal-mapped plastic grain, rim light, better lid thickness and bevels; warm-up text that types "LAZARUS·DEX v1" on the 3D LCD.
- **Phase 3.** Richer feedback: an evolution-chain step animation (highlight traveling along the chain), area map "scan line" transitions, a nap-mode dimmed LCD backlight with D-pad keyboard hints.
- **Phase 4.** Perf audit (Lighthouse on mobile, bundle split of Three to keep it under 150 KB gz if possible) and a11y audit with a screen reader pass.

## 8. Acceptance criteria and verification

- First visit (motion allowed): overlay appears with POWER and SKIP. Activation reaches the working view in ≤ 3 s. A reload goes straight in. REPLAY INTRO plays it again. SKIP and Esc work at any moment.
- Reduced motion: no overlay and no animation; the app is usable immediately.
- Forced WebGL failure (`getContext('webgl2')` returns null): the CSS poster and fallback flip work with no console errors.
- Rapid selection of 8 Pokémon in about 0.5 s: the entry shows the last one, with the stat bars at their final widths.
- Lens and LEDs: `data-snooze` goes think → talk → idle (or error) during a question, and `data-led` reflects busy, ready and nap.
- Keyboard: Tab reaches POWER, SKIP, the search, the list and the entry links with visible focus. Enter activates. B naps.
- No horizontal scroll and no console errors at 390, 768 and 1440 in Chromium, Firefox and WebKit.
- Existing features keep working: search, the ALL/POKÉMON/AREAS and scope filters, chat answer and source links, area view and back with the list scroll restored, mobile tab switching.
- Verification: a Playwright script (`scripts/device-test.mjs`) covers all of the above across three engines and three widths, saves `screenshots/device-*.png`, and then runs a smoke test against https://lazarus-dex.vercel.app after the push.
