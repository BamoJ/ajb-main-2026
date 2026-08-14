# SBJ Starter — Project Progress Log

> **How to use this file (Claude: this is binding).**
> This file is auto-loaded into every session via `.claude/CLAUDE.md`. Read
> and honor it BEFORE any work. After EVERY finished task, append a note:
> what changed, why, current state. Mandatory, not optional. Tighten entries
> when they get long, never delete lessons. Fresh `/new-project` clones:
> reset the entries below to the new project's reality.

---

## 2026-07-31 — Transition + WebGL hardening pass

**What:** TransitionManager reworked (Taxi inits before Components/Animation,
`reloadCssFilter: false`, live-DOM view sweep, detectPageName route dispatch,
rAF yield before re-init, `scroll.resize()`, NAVIGATE_IN theme/nav hooks,
`leaveTrigger` handoff, `static initialEnter` hard-load seam). GlobalEnter is
now a gated crossfade with per-page pacing + `composeEnter` seam (the fixed
1500ms-per-navigation wait is gone). Preloader works headless (`onProgress`).
Flight fixes: staged mesh clones its geometry (cleanup was disposing the live
source plane's buffers); ProjectTrans beats use GSAP-native `'<35%'` /
`'>-20%'` positions — a bare `'35%'` creates a LABEL, not a percentage
(gsap-core.js:597). DOMPlane hover-freeze fixed; Home planes visible by
default, texture failures counted, `home:intro-started` composer signal. New:
`utils/theme.js` + `utils/nav.js` + `styles/theme.css`,
`canvas/utils/RendererPool.js`, `easings.revealEase` restored, Lenis
`anchors`/`lagSmoothing(100,16)`/`resize()`, `glsl({ compress: true })`.
Docs (CLAUDE.md, README, 5 skills) purged of the never-shipped transition API.

**State:** both build configs compile; DOM-only bundle carries no
WebGLRenderer; doc grep clean. PENDING: Bamo's live-staging verify (SPA round
trips, theme carry, hover-then-scroll plane tracking, flight timing, reduced
motion). Known-left: `boot.js`'s static Canvas import keeps ~61KB of three in
DOM-only builds (605KB → 544KB without) — remove per project by deleting the
`initWebGL`/`textureLoadAssets` imports.

---

## 2026-08-14 — DOM-only build: WebGL removed from bundle

**What:** This project ships without WebGL. Deleted `initWebGL`,
`textureLoadAssets`, and the `Canvas`/`TextureCache` imports from
`src/_core/boot.js` (the known-left item above — that static import chain was
the only thing pulling Three.js into the bundle; `main.js` was already wired
DOM-only with `canvas: null` and no Preloader). `src/canvas/` stays on disk
untouched — unreferenced files cost zero bundle bytes.

**State:** `bun run build` → dist/main.js is 178.88KB (65.5KB gzip), zero
grep hits for `WebGLRenderer`/three markers. To re-enable WebGL: restore
boot.js from the starter (`git show 16791bc:src/_core/boot.js`) and wire
Canvas per the comment block in `main.js`.

---

## 2026-08-14 — Home hero grow-and-pan scroll animation

**What:** `animations/scroll/HeroScroll.js` (was an unregistered fade stub)
rebuilt as the home hero interaction, registered as
`data-anim="hero-scroll"`. Scrubbed over Webflow's 400vh `.sticky_track`:
image box set to 100vw at the artwork's NATURAL aspect ratio (read from
naturalWidth/Height at runtime — the Webflow 2/3 box was cropping the
1728×2267 tiger), scaled 0.1→1 (GPU-only, no width tweens), then panned
top→bottom; pan ends bottom-aligned with the track so the sticky release is
the seamless handoff into `.content-wrapper`. Also forces `sizes="100vw"` +
eager on the img (published DOM ships `sizes="120px"` + lazy → permanent
500w blur otherwise). AnimationCore: scrub branch now forwards
`invalidateOnRefresh` (new option, default off).

**State:** builds (179.96KB). NOT yet verified in browser. Needs in Webflow
Designer: `data-anim="hero-scroll"` on `.sticky_track`, `data-hero-image` on
`.home_image`. BIGGER GAP: published page has NO `data-taxi-view`/`data-taxi`
wrapper — TransitionManager/Taxi may not boot against the live site at all;
wire that before judging the animation. Known-left: reduced-motion leaves a
10vw image on a 400vh track; short-viewport phones get a center→bottom drift
instead of a full pan (imgHeight < viewport) — acceptable, revisit in polish.

**Update (same day):** hero verified working live by Bamo. Text-overlap fix:
the heading parent was absolute at the TOP of the 400vh track (not sticky) so
it scrolled away before the image grew — Bamo moved
`.home_hero_heading_parent` INSIDE `.home_hero_image` (the sticky stage) in
the Designer; exclusion blend keeps it legible. Heading choreography added to
HeroScroll on the same scrub: rise to viewport center (0→0.25), hold (gap),
unlock at the fullscreen moment (anchored to GROW, now 0.4 after Bamo's
tuning) → linear crawl off the top + fade, gone by 0.85. New Webflow hook:
`data-hero-heading` on `.hero_heading_wrap`. Bamo also dropped the JS
`loading='eager'` (sizes='100vw' kept). Builds at 180.40KB; browser verify of
the heading beats pending.
