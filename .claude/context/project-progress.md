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
HeroScroll on the same scrub: rise to viewport center (0→0.25), then — after
iteration — NO hold: continuous slower linear crawl off the top, gone by
0.85, no fade (Bamo removed autoAlpha), independent of GROW (0.4). New
Webflow hook: `data-hero-heading` on `.hero_heading_wrap`. Bamo dropped the
JS `loading='eager'` (sizes='100vw' kept).

**Final shape (after mobile blow-up):** the no-crop pan on a phone left the
image ~60% of screen height drifting between white bands (artwork 1.31:1 vs
phone ~2.16:1 — full-bleed + no-crop are mutually exclusive on portrait
screens). Bamo re-authored `.home_image` to 100vw×100vh cover in Webflow.
HeroScroll now branches once at setup via `isMobile()` (UA + ≤768px):
DESKTOP keeps the verified grow-uncropped→pan→bottom-aligned-release (JS
re-imposes natural aspect over the authored box: width 100vw + aspectRatio
from naturals); MOBILE grows scale 0.1→1 into the authored cover box over
GROW and then STICKS — zero movement until the sticky release. Timeline got
a duration-1 spine tween so beat constants stay fractions of the track.
Builds; Bamo's device re-verify pending.

---

## 2026-08-14 — ParaReveal rewritten for attribute-on-element markup

**What:** `animations/global/text/ParaReveal.js` rewritten. Root cause of the
"messy lines": the class was written for a wrapper pattern
(`querySelectorAll('p…span')` on descendants), but the live site puts
`data-anim="paragraph"` directly ON the text element (all 24 on the homepage:
1 `<p>` with inline styled spans, 21 `.text-block` divs, 1 `<h2>`, 1 plain
`<p>`). Result: the spans-in-`<p>` case split each inline span as its own
SplitText target (line boxes broke mid-sentence), and the divs/h2 matched
nothing → never animated at all (desktop AND mobile). Fix: split
`this.element` directly (same idiom as HeadingReveal); mobile fades
`this.element`. Removed per Bamo: the `display:contents` triggerElement
branch (pattern not used in this project). Also removed: `preserveHTML`
(doesn't exist in gsap 3.15 SplitText — verified 0 hits in source),
`reduceWhiteSpace: false`, the `originalContent` innerHTML save/restore
(`split.revert()` does it natively). Second root cause fixed: fonts load
async via WebFont.js, so lines were measured against fallback metrics —
added a one-time `document.fonts.ready` re-split (skipped when fonts already
loaded). New `resplit()` shared by resize + font hook, guarded by
`_isSetup`/`_isActive` (old resize handler could arm a ScrollTrigger before
TransitionManager's activate()) and `_hasPlayed` (revealed paragraphs snap to
end state via `progress(1)` instead of replaying). `_destroyed` guard makes
late resize/fonts callbacks inert after Taxi page-leave. Kept Bamo's
`yPercent: 120` start value.

**State:** builds (180.15KB), prettier clean, bundle grep confirms
fonts.ready path in / preserveHTML out. NOT yet browser-verified — check via
`bun run dev` + `https://ajb-website.webflow.io/?dev=true`: featured
paragraph splits into clean full lines with spans inline; text-block divs +
h2 now reveal; mobile ≤991px fades; resize + slow-font reload re-split
without replaying. Known-left: font re-split can shift other animations' ST
positions (if drift visible, one `ScrollTrigger.refresh()` after fonts.ready
at manager level); isMobile fixed at construction (pre-existing).

---

## 2026-08-14 — Artwork list hover (/artwork): big-thumb reveal

**What:** `components/artwork-list-hover/artwork-list-hover.js` rewritten
(was a half-edited copy of the homepage `art-hover` — undefined vars, broken
`.wrp-artwork list` selector, slug pairing this page doesn't need). Live DOM
validated via curl of the published /artwork page: each `.w-dyn-item` has ONE
`a.artwork-link` wrapping both the text row and its own `.artwork_thumb_big`
(Webflow CSS: `clip-path: inset(50% 0%)`, `position: absolute` centered on
the row, `pointer-events: none`) — so no cross-list lookup at all. Behavior
(per Bamo): open on mouseenter (clip → `inset(0% 0%)`, 0.9s revealEase, img
scale 1.25→1), CLOSE on mouseleave (0.45s back to center). `gsap.to` +
`overwrite: true` (NOT fromTo): re-enter mid-close continues from the current
clip value instead of snapping. Reduced motion → gsap.set. AbortController +
onDestroy killTweensOf. `art-hover/` (homepage) untouched.

**State:** builds (183.35KB), prettier clean, `artwork_thumb_big` present in
bundle. NOT browser-verified yet. Needs in Webflow Designer:
`data-component="artwork-list-hover"` on `.section-artwork-list` (published
page currently has NO data-component anywhere). Flagged to Bamo:
`.artwork-link:hover { opacity: .8 }` dims the revealed thumb too (it's
inside the link) — remove in Webflow if it looks wrong, JS unaffected.
Verify via dev server + `/artwork?dev=true`: open/close wipes, row-to-row
spam, re-enter mid-close smoothness; if an open thumb ever paints under a
later row's text (hover opacity creates a stacking context), fix is a
zIndex raise on enter — verify first, don't pre-add.

---

## 2026-08-17 — Home featured artwork: entrance + hover (art-hover)

**What:** `components/art-hover/art-hover.js` — entrance reveal AND hover
reveal for the homepage `.featured-artworks` section, in ONE file. Deliberate:
both write clipPaths on the same elements, so a second owner (an
`animations/` registry class) would race the first. Confirmed working by Bamo.

**Architecture — the part that matters.** The section has TWO separate CMS
lists (links vs thumbs) whose items and order do NOT match, so pairing is by
SLUG: link `href` tail ↔ CMS-bound `data-art-slug` on `.wrp-img-highlight`.
The three `.home_artwork_item`s are absolutely stacked and EACH carries the
opaque beige `#f4f4ed` — that fact caused every bug this session. Final design
(Bamo's idea, correct): a **cloned backdrop** — `first.item.cloneNode(true)`,
image included, `data-art-slug` stripped, `zIndex: 0`, inserted as first child
of `.home_artwork_list`. It owns the beige AND displays the settled artwork.
The real panels become pure animation layers: permanently transparent
background, `zIndex >= 1`, masks hidden at rest. Hover = raise panel, `fromTo`
mask `inset(100% 0 0 0)`→`inset(0)` + img scale 1.25→1 (1.5s `revealEase`,
`overwrite: true`). On complete, `settle()` copies the image onto the backdrop
(src/srcset/sizes) and — after `img.decode()`, guarding a one-frame blank —
resets all panels. Entrance runs entirely on the backdrop: beige wipes
bottom→up (1.7s), artwork follows at `'<45%'`; `onView` from `@core/observe`
(`rootMargin: '0px 0px -15% 0px'`, once); hover listeners armed ONLY in the
entrance's `onComplete`, so the two can never interleave.

**Why this shape (4 failed designs — do NOT reintroduce):** (1) painting the
beige on `.home_artwork_list` = full-page beige (that element is huge, not the
box). (2) Instantly hiding non-current items = the reported "image gone
abruptly" — an image must be hidden ONLY when something fully covers it.
(3) Discarding an interrupted wipe = visible jump back to item 1. (4) A
`shown` flag that skipped the tween on re-hover = "dead" fast hovers. The
backdrop kills all four at once: every panel is always closed when hovered, so
every hover animates, and what sits under a wipe is the backdrop, which hover
logic never touches.

**State:** builds (187.48KB), prettier clean, verified live by Bamo.
Known-left: (a) pre-JS the browser paints the LAST stacked item on top for a
frame — kill with a z-index on the first `.home_artwork_item` in the Designer
if the flash bothers; (b) the thumbs list renders zuri / light-in-the-darkness
/ danger-close while the links list renders savannah-smile / zuri /
light-in-the-darkness — a link with no matching thumb simply does nothing;
fix by pointing both lists at the same items/order in Webflow; (c) a future
DOM page transition may want to compose with the entrance — add a signal then,
not now.

---

## 2026-08-18 — Page transitions + hard-load loader; WebGL deleted from source

**What:** Three things in one pass. (1) **WebGL removed entirely**: deleted
`src/canvas/` (11 files), `utils/client-rect.js`, `utils/public-asset.js`,
`transitions/pages/` (ArtworkTrans + the 6 empty stubs), skills
webgl-page/shader/dom-plane; dropped `three` + `vite-plugin-glsl`, the
`@canvas` alias and `__PUBLIC_ASSET_ORIGIN__` define; package renamed
`ajb-main-2026`. Zero bundle change (already DOM-only since 08-14); restore
path: `git show 62e2727:src/canvas/`. `detectPageName` is now attribute-only
(`data-page` on/inside the view — NO URL fallback). (2) **Transitions**:
every page uses GlobalEnter's crossfade + NEW shared hero enter
(`transitions/global/heroEnter.js`): `[data-hero-heading]` rises
(yPercent 24 + fade, 1.2s), `[data-hero-image]` clips open bottom→up
(1.4s, `'<35%'`); registry in main.js stays EMPTY by design (Bamo: fewer
Trans classes). Safe channels only (opacity/yPercent/clip-path) so
HeroScroll/ArtworkHero scrubs never conflict; hero-tagged elements must not
also carry `data-anim`. **Snap-bug fix (do NOT regress)**: incoming view's
`Animation(to)` is now built PRE-fade at `opacity: 0` (wrapped onEnter),
adopted + `activate()`d post-fade — old order re-setup AFTER the fade, so
every SPA nav painted the new page visible, snapped it hidden, then
replayed reveals. Taxi-cache-safe (fetched pages cache from HTML string,
verified in taxi source). New constraint: `data-anim` only INSIDE
`[data-taxi-view]`. (3) **Loader**: main.js boots via Preloader when a
Webflow-authored `[data-loader="wrapper"]` exists — manager constructed
behind the opaque overlay with new `deferInitial: true`, `onComplete` (now
actually fired after animateOut) calls new `manager.initialEnter()` (arm
ScrollTriggers → startScroll → play the same shared hero enter). Headless
fallback boots immediately. Mobile menu now closes BEFORE the fade via an
awaited `onPageOut` (was frozen open through transitions). Docs (README,
CLAUDE.md, 7 skills) purged of WebGL.

**State:** builds green (193.34KB / 69.78KB gzip), prettier clean, dist grep
0 hits for THREE/ShaderMaterial/__PUBLIC_ASSET_ORIGIN__. NOT browser-verified
— nothing can run until Webflow gets the Taxi wiring: published site has ZERO
`data-taxi`/`data-taxi-view` (verified by curl of all 7 page types; Taxi init
is guarded and silently skips). Bamo's Designer checklist (per page): wrapper
div `data-taxi` + inner `data-taxi-view` (EMPTY value) + `data-page`, page
sections moved inside; header/mobile-menu/footer/loader stay OUTSIDE and must
exist on EVERY page; hero hooks per page (about h1 + bio img, shop h1,
contact h2, artwork `.artwork-category`, artwork-detail img INSIDE
`.artwork_visual_top` — not the track itself, shop-detail h1 + first product
img; home already tagged); loader symbol `data-loader` wrapper/num/bar
authored visible; optional `data-nav-link` on nav anchors. Flags: shop-detail
template has NO `.footer` (persistent-footer plan assumes it gets one); real
routes are `/about-adrian-barnaby`, `/artwork-collections/<slug>`,
`/ajb-store/<slug>`; staging (`*.webflow.io`) always tries localhost first →
2 failed requests per visitor (out of scope). Known-left: reduced-motion
skips composeEnter (static page, intentional); Bamo added an unfinished
SplitText line in heroEnter.js mid-session (unused `headings` const, no null
guard) — resolve with him before shipping.

**Update (same day, evening):** Per Bamo, heroEnter.js MERGED into
GlobalEnter.js (one file, deleted heroEnter.js); heading now SplitText
`lines`+`mask` rise (yPercent 120, stagger 0.08); NEW third hook
`data-hero-content` (opacity fade). ALL indirection stripped on his order:
no pacing constants, no `this.inDelay ??` fields, no 'reveal' label, no `at`
param, no ternary positions — every duration/ease/position is a literal in
its tween (in-fade 1s at `0.2`, out 0.5s at `0`; beats: image 1.5s at `0.2`,
lines at `'>'`, content at `'<50%'`); the resolved/pending/backstop machinery
replaced by one `tl.call()` at the fade's end. Builds 193.24KB, docs synced.
Bamo wired Webflow live: `.page_wrapper[data-taxi]` > `.main[data-taxi-view]`
per page; footer stays INSIDE the view BY DESIGN (shop-detail is
intentionally footer-less — do NOT re-flag it). Footer-on-top bug root cause:
leftover `data-taxi` on About's <body> beats the inner wrapper in
querySelector order — Bamo removing body attrs per page. Timing tuning still
open ("still off" per Bamo); skills docs still half-trimmed.

**Session close (2026-08-18 night):** Hero enter final shape in
GlobalEnter.js — image 1.5s at `0.2`; heading SplitText lines at
`media ? '<+0.9' : 0.7` (the ONE allowed ternary: pages without a visual
need a different lead-in; both values Bamo's literals, 0.7 his tune);
content fade at `'<50%'`. Builds green. LEFT FOR BAMO IN DESIGNER:
(a) remove leftover `data-taxi`/`data-page` from <body> on About + audit
other pages (root cause of footer-on-top; home verified clean);
(b) hero hooks — shop: h1.heading + .section-artwork-list(content);
contact: h2 in .wrp-contact + form block(content); artwork:
.artwork-category + .section-artwork-list(content); about/artwork-detail/
shop-detail per earlier checklist incl. data-hero-content picks;
(c) loader element (data-loader wrapper/num/bar, authored visible);
(d) optional data-nav-link on nav anchors. LEFT IN REPO: timing tuning
(Bamo, by eye); skills docs half-trimmed (debug/transition/perf-audit/
scroll-anim/webflow still mention WebGL); optional fonts.ready re-split
for hero lines if hard-load line breaks look wrong.

---

## 2026-08-18 — Loader exit: wipe-up + overlap handoff (pre-authored)

**What:** Preloader.js only. `complete()` now fires `onComplete()` (→
`manager.initialEnter()`) BEFORE `animateOut()` — hero enter plays underneath
so the wipe reveals a page already in motion (double-call safe:
AnimationCore.activate() guards `_isActive`). `animateOut()` replaced the
0.6s opacity fade with a wipe up: `clipPath` `inset(0% 0% 0%)` →
`inset(0% 0% 100%)`, 0.9s `power4.inOut` (site's wipe ease), reduced-motion
snaps visibility hidden, format-matched 3-value insets. All literals inline.

**State:** builds 193.37KB, prettier clean, UNCOMMITTED. Webflow overlay DOM
does NOT exist yet — headless branch keeps booting plain, so this is safe to
ship anytime. Bamo's Designer checklist for the overlay: symbol on every
page outside `.page_wrapper` — `data-loader="wrapper"` (fixed, inset 0,
z-top, solid bg, authored VISIBLE), text "0" `data-loader="loader-num"`,
bar FILL div `data-loader="progress-bar"` (JS drives fill width 0→100%,
author fill at width 0 inside a track), optional static logo.

---

## 2026-08-19 — artwork-list-hover attribute-driven (reuse on /shop)

**What:** `components/artwork-list-hover/artwork-list-hover.js` (verified
working on /artwork) refactored from class queries to ONE data-attribute so
the shop list can reuse it with its own thumb class: query
`[data-hover-thumb]` per thumb, derive the row link via `thumb.closest('a')`
(thumb sits inside its `<a>` on both pages — verified by curl of live /shop),
img via `thumb.querySelector('img')`. Tweens untouched (0.9 in / Bamo's 0.3
out, `to` + `overwrite: true`, reduced-motion set, AbortController cleanup).
No `.artwork_thumb_big` fallback kept — one-time migration by publish
sequencing, not permanent cruft. JS↔Webflow contract: thumb authored
absolute + pointer-events none + `clip-path: inset(50% 0%)` (JS animates
exactly that ↔ `inset(0% 0%)`); size/aspect free per section class.

**State:** builds (193.34KB), prettier clean, bundle grep: `hover-thumb` in,
`artwork_thumb_big`/`artwork-link` 0 hits. NOT browser-verified. Designer
work (Bamo): (a) /artwork — add `data-hover-thumb` on `.artwork_thumb_big`;
(b) /shop — `data-component="artwork-list-hover"` on the list section +
author big thumb (own class) with `data-hover-thumb` and the three authored
properties, `<img>` inside; (c) /shop view has leftover `data-page="contact"`
→ should be `"shop"`. SEQUENCING: publish Webflow attrs BEFORE/with deploying
this bundle — refactored JS finds nothing on the old /artwork markup.
