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
