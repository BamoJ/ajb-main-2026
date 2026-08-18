# Webflow Motion Boilerplate (DOM-only)

## Project progress log — READ FIRST

@context/project-progress.md

Before ANY work: read and honor `.claude/context/project-progress.md`
(imported above — task history, current state, known-left items). After
EVERY finished task: UPDATE it (what/why/state). This is mandatory, not
optional.

## What This Is

A modular toolkit for Webflow sites: GSAP animations, Taxi (page routing),
Lenis (smooth scroll). HTML lives in Webflow — this repo is the JS layer
injected via `<script>`. **No WebGL** — the canvas layer was removed
entirely on 2026-08-18 (restore from history if ever needed:
`git show 62e2727:src/canvas/`).

Output: single IIFE bundle (`dist/main.js`) with CSS inlined via
`vite-plugin-css-injected-by-js`.

**Performance target: 60fps minimum on every supported device.** See
`/perf-audit` for the full audit checklist; `@utils/perf` ships an FPS
overlay for live measurement.

## Architecture Overview

```
src/
├── _core/                   # Foundation — sorts to top of src/
│   ├── boot.js              # initCore (Lenis singleton + perf)
│   ├── hooks.js             # onMount/onDestroy/onPageIn/onPageOut
│   ├── observe.js           # ObserverManager + onView (pooled IntersectionObserver)
│   ├── track.js             # onTrack — scroll progress 0-1 over a viewport sweep
│   ├── raf.js               # Unified RAF, priority subscriptions (Lenis=0, perf=10)
│   └── resize.js            # Centralized debounced resize subscriptions
├── transitions/             # Taxi-based routing
│   ├── index.js             # TransitionManager — wraps Taxi, runs lifecycle hooks
│   ├── Preloader.js         # Hard-load loading screen (Webflow-authored overlay)
│   └── global/
│       └── GlobalEnter.js   # Default crossfade + shared hero enter (one file)
├── components/              # Auto-discovered DOM components
│   ├── index.js             # Wraps discoverComponents/destroyComponents
│   └── discover.js          # import.meta.glob → registry by filename
├── animations/              # Scroll-driven DOM animations
│   ├── index.js             # Registry-based discovery (data-attr → class)
│   ├── AnimationCore.js     # Base: setup() + activate() split
│   ├── global/              # FadeIn, HeadingReveal, ParaReveal, ImageReveal, ImageParallax, LineReveal
│   └── scroll/              # HeroScroll (home), ArtworkScroll (artwork detail)
├── webflow/                 # Webflow-specific helpers
│   ├── detect-editor.js     # MutationObserver for w-editor-publish-node
│   └── reset-webflow.js     # Re-runs window.Webflow native JS after Taxi swaps
├── utils/                   # Standalone utilities
│   ├── Emitter.js           # Class + singleton event bus
│   ├── smoothscroll.js      # Lenis wrapper (singleton, registers on @core/raf)
│   ├── easings.js           # GSAP custom easings
│   ├── media.js             # prefersReducedMotion(), isMobile()
│   ├── math.js              # damp, lerp, clamp(v, min, max), map
│   ├── theme.js             # u-theme-* carry-over across Taxi swaps + theme:change
│   ├── nav.js               # updateActiveNav — is-active on matching [data-nav-link]
│   └── perf.js              # FPS overlay, frame drops, web vitals (auto-init; window.perf)
├── styles/                  # CSS outside Webflow
└── main.js                  # Entry — Preloader (if authored) + TransitionManager
```

## Lifecycle Hooks (`@core/hooks`)

The runtime contract every component, animation, and transition writes against. Modules push callbacks; the transition layer runs them at the right moment.

```js
import { onMount, onDestroy, onPageIn, onPageOut } from '@core/hooks'

onMount(() => { /* sync setup, after DOM swap, before user sees the page */ })
onDestroy(() => { /* sync teardown — listeners, timers, refs */ })
onPageIn(async () => { /* async, awaited; activate scroll animations here */ })
onPageOut(async () => { /* async, AWAITED before the fade — element-aware exit animations */ })
```

`runDestroy()` fires on every Taxi `onLeave` — that's the cleanup point. `runMount()`/`runPageIn()` fire on every Taxi `onEnter`. Each call drains the queue (no leftovers between pages).

## Auto-Discovery

### Components — `[data-component="name"]`

A file at `src/components/<anywhere>/<name>.js` exporting a default function is auto-mounted on every element with `data-component="<name>"`. The factory receives `(element, dataset)` and registers cleanup via `onDestroy`.

Discovery uses Vite's `import.meta.glob('./!(index|discover|_core)/**/*.js', { eager: true })`. The filename (lowercased) is the component name. Nested components work. Initialized elements are flagged so re-discovery is a no-op.

### Animations — registry-based

`src/animations/index.js` maps data-attribute → class. Add a new animation: drop a class file under `animations/`, add one line to the registry.

**Lifecycle:** `setup()` builds the timeline (no ScrollTrigger). `activate()` creates the ScrollTrigger that drives it. On SPA navs the INCOMING view's animations are set up pre-fade (see Transitions below); `activate()` runs after the page is settled. `destroy()` is called on every page leave.

`prefersReducedMotion()` is honored: when set, `setup()` early-returns and no timelines or ScrollTriggers are created.

**HARD CONSTRAINT: `data-anim` only inside `[data-taxi-view]`.** SPA re-discovery is scoped to the incoming view — an animation on persistent chrome (header/footer/menu) would never be re-created after the first navigation.

## Boot (`src/main.js`)

```js
window.Webflow.push(() => {
	const scroll = initCore(); // Lenis singleton

	if (document.querySelector('[data-loader="wrapper"]')) {
		let manager;
		scroll.stopScroll();
		new Preloader({
			onAppStart: () => {
				manager = new TransitionManager({ pageTransitions, deferInitial: true });
			},
			onComplete: () => manager.initialEnter(),
		}).start();
	} else {
		new TransitionManager({ pageTransitions }); // headless — no loader authored
	}
});
```

The loader path only runs when Webflow has authored a `[data-loader="wrapper"]`
overlay. `onAppStart` constructs the whole app behind the still-opaque overlay
(Taxi cache seed, components, animation hidden states, paused hero timeline);
after the overlay fades out, `onComplete` → `manager.initialEnter()` arms
ScrollTriggers, starts scroll, and plays the hero enter. Headless boots work
identically to a no-loader site.

## Page Transitions

**Every page uses `GlobalEnter`** — a crossfade (old view out 0.5s, new view
in 1s at `0.2`) with the **shared hero enter** riding the fade-in. ONE file:
`transitions/global/GlobalEnter.js` holds both the fade and the hero beats,
all timing inline in the tweens (Bamo's rule: no hoisted constants, direct
position parameters). The per-page registry in `main.js` stays empty until a
page truly earns bespoke choreography (`composeEnter(to, tl)` override +
optional `static initialEnter(view)` for hard loads).

### Shared hero enter (`composeHeroEnter`, bottom of GlobalEnter.js)

One implementation, two call sites (SPA: `GlobalEnter.composeEnter`; hard
load: `TransitionManager._buildInitialEnter`). Webflow-authored hooks, all
optional per page — beat order: visual → heading → content:

| Attribute | Motion | Channels used |
|---|---|---|
| `data-hero-image` | clips open bottom→top (1.5s, at `0.2` — kicks first) | `clip-path` |
| `data-hero-heading` | SplitText lines rise from masks (yPercent 120, stagger 0.08, at `'>'`) | `yPercent` on line divs |
| `data-hero-content` | fades in (1s, at `'<50%'`) | `opacity` |

Safe-channel rule: HeroScroll (home) and ArtworkHero (artwork detail) scrub
`y`/`scale` on these same elements — the hero enter deliberately uses only
opacity/yPercent/clip-path so the two never fight. A hero-tagged element must
NOT also carry `data-anim` (two owners racing one element). Pages without
hooks degrade to the plain crossfade.

### SPA navigation order (encoded in `transitions/index.js` — do NOT regress)

1. `onLeave`: stopScroll → `transition:start` → await `runPageOut()` → `runDestroy()`
2. Taxi inserts the new view (`removeOldContent: false` — both views in DOM)
3. `NAVIGATE_IN`: theme carry-over + active nav
4. **Pre-fade, same synchronous task:** incoming view set to `opacity: 0`, and
   `new Animation(to)` (view-scoped) builds all its timelines — hidden states
   land while the view is invisible. The OLD page's instances stay alive and
   animating through the fade. This ordering is the fix for the "page paints
   visible → snaps hidden → replays reveals" bug — moving re-init back after
   the fade reintroduces it.
5. Crossfade + `composeEnter` (shared hero enter) on one timeline; a
   `tl.call()` placed at the fade's end triggers page re-init, so long
   reveals never delay it
6. After the fade: sweep old views → scrollTo(0,0) → Lenis resize → rAF yield →
   `resetWebflow()` → re-discover components → adopt the pre-built Animation →
   `activate()` (ScrollTriggers arm only now — no scroll race) → startScroll →
   await `runPageIn()` → `transition:complete`

### Transition gotchas (all encoded in code — do NOT regress)

- **Taxi inits BEFORE Components/Animation** (TransitionManager constructor). Taxi snapshots the entry DOM into its page cache; if SplitText ran first, split markup gets cached and every SPA return re-splits it → nested masks. (Fetched pages are safe — Taxi caches them from the fetched HTML string, never the live DOM.)
- **`reloadCssFilter: false`** — Webflow's CDN can serve pages referencing different hashed builds of the same shared CSS; Taxi would append the stale stylesheet to `<body>` and its bare-element defaults win the cascade for the session.
- **Old views are swept from the live DOM** (`querySelectorAll('[data-taxi-view]')`, remove all but `to`) — never a cached `fromElement`, which desyncs under `removeOldContent: false`.
- **Reduced motion skips `composeEnter` entirely** (GlobalEnter early-returns before it) — the page snaps in static. This is intentional.
- **GSAP positions:** `'<35%'` / `'>-20%'` are percentages of the previous tween; a bare `'35%'` creates a LABEL literally named "35%". Labels + percent-of-previous only, never bare decimal seconds.

## Preloader (`transitions/Preloader.js`)

Hard-load only. Drives a Webflow-authored overlay:

| Attribute | Purpose |
|---|---|
| `data-loader="wrapper"` | Fullscreen fixed overlay, authored VISIBLE (JS hides it) |
| `data-loader="loader-num"` | Progress number (bare text, no % sign) |
| `data-loader="progress-bar"` | Bar — JS drives `width: 0→100%` |

Default `loadAssets` preloads the page's `<img src>` set (progress capped at
95 until completion). `onComplete` fires after the overlay has fully faded
out. Headless-safe: without the wrapper, progress still reports via
`onProgress` — but `main.js` skips the Preloader entirely in that case.

## Webflow Integration

- HTML built and hosted in Webflow; this bundle loads via `<script>` (hybrid dev/prod loader in site custom code — see README).
- Entry waits for `window.Webflow` ready callback.
- Taxi intercepts `<a>` links for SPA navigation; `resetWebflow()` runs after each swap so forms / tabs / sliders re-init.
- Editor mode: `handleEditor()` pauses Lenis when the Designer is active.
- **Theme carry-over** (`@utils/theme`): pages author `u-theme-dark|light|brand` on `<body>`. On `NAVIGATE_IN` the incoming document's body class is applied to the live body, cross-fading via `body.is-theme-switching` (600ms, `styles/theme.css`), broadcast as `theme:change`. Fallback: `data-theme` on the incoming view.
- **Active nav** (`@utils/nav`): `updateActiveNav()` toggles `is-active` on `a[data-nav-link]` whose path matches the URL — on boot and every `NAVIGATE_IN`.
- **Persistent chrome** (header, mobile menu, footer, loader) lives OUTSIDE `[data-taxi-view]` and comes from the ENTRY page only — it must exist identically on every page in Webflow.

## DOM Attributes

| Attribute | Purpose |
|---|---|
| `data-component="name"` | Auto-mount component file `<name>.js` on this element |
| `data-page="home"` | Page name on the view — per-page transition dispatch (attribute-only, no URL fallback) |
| `data-taxi` | Persistent wrapper around the view (required for SPA) |
| `data-taxi-view` | Taxi's swap target (value must stay EMPTY) |
| `data-taxi-ignore` | Exclude link from Taxi SPA routing |
| `data-lenis-prevent` | Exclude element from Lenis smooth scroll |
| `data-nav-link` | Nav anchor — gets `is-active` when its path matches the URL |
| `data-theme="dark"` | Per-view theme fallback (primary source: `u-theme-*` on body) |
| `data-hero-image` | Shared hero enter: clip reveal, first beat (also HeroScroll's image on home) |
| `data-hero-heading` | Shared hero enter: SplitText line rise (also HeroScroll's heading on home) |
| `data-hero-content` | Shared hero enter: opacity fade, last beat |
| `data-loader="wrapper|loader-num|progress-bar"` | Preloader overlay parts |
| `data-anim="fade-in|line|image-reveal|image-parallax|heading|paragraph|hero-scroll|artwork-hero|artwork-gallery"` | Registered animations (INSIDE the view only) |

## Global Events (`@utils/Emitter` singleton)

- `transition:start` — page navigation begins
- `transition:complete` — new page mounted, hooks done
- `theme:change` — `{ theme, previous, animate }` from `@utils/theme` applyTheme()

## Path Aliases

```
@           → src
@core       → src/_core
@transitions → src/transitions
@components → src/components
@ui         → src/components/ui
@animations → src/animations
@webflow    → src/webflow
@utils      → src/utils
@styles     → src/styles
```

## Build & Dev

- `bun install`
- `bun run dev` — Vite dev server on `localhost:3000` with HMR
- `bun run build` — outputs `dist/main.js` (single IIFE)
- `bun run preview` — preview the production bundle locally

### Dev / Prod Switching

Webflow's site-level custom code includes a hybrid loader. By default it loads from Vercel; `?dev=true` or any `*.webflow.io` host swaps to localhost with auto-fallback. See README for the snippet and behavior matrix.

## Performance Monitoring (`@utils/perf`)

Auto-starts via `_core/boot.js`. Runs on the unified RAF (priority 10 — sees end-of-frame timing).

```js
import perf from '@utils/perf'
perf.toggleFpsDisplay()         // also Shift+F (persists in localStorage)
perf.getMetrics()               // fps, frameTime, min, max, smoothness, budget
perf.getWebVitals()             // FCP, LCP, CLS via PerformanceObserver
perf.add('marker-name')         // timing marker
perf.enableFrameDropDetection() // opt-in, tracks frames > 50ms
```

`smoothness` = 100 − (stddev/avg × 100). `budget` = % of frames under 16.67ms.

## Conventions

- Tabs for indentation, single quotes, trailing commas (see `.prettierrc`).
- Mobile guard: `prefersReducedMotion()` + `isMobile()` from `@utils/media`.
- Console logs stripped in production via terser.
- No TypeScript. Plain JS only.
- Animation start/end states are LITERALS (vh/vw strings, yPercent, plain numbers). Runtime measurement only when content-dependent with no literal alternative.

## Claude Code Skills

| Command | Purpose |
|---|---|
| `/transition` | Page routing + transitions |
| `/scroll-anim` | Scroll animations (GSAP + ScrollTrigger + SplitText) |
| `/component` | Auto-discovered DOM components |
| `/perf-audit` | 60fps audit checklist |
| `/webflow` | Webflow integration |
| `/debug` | Symptom-to-diagnosis guide |
| `/new-project` | Bootstrap a new project |
