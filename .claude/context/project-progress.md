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
