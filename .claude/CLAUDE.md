# WebGL + Webflow Boilerplate

## Project progress log — READ FIRST

@context/project-progress.md

Before ANY work: read and honor `.claude/context/project-progress.md`
(imported above — task history, current state, known-left items). After
EVERY finished task: UPDATE it (what/why/state). This is mandatory, not
optional.

## What This Is

A modular toolkit for Webflow sites with custom WebGL experiences. Built on Three.js, GSAP, Taxi (page routing), Lenis (smooth scroll). HTML lives in Webflow — this repo is the JS/WebGL layer injected via `<script>`.

Output: single IIFE bundle (`dist/main.js`) with CSS inlined via `vite-plugin-css-injected-by-js`.

**Performance target: 60fps minimum on every supported device.** See `/perf-audit` for the full audit checklist; `@utils/perf` ships an FPS overlay for live measurement.

## Architecture Overview

```
src/
├── _core/                   # Foundation — sorts to top of src/
│   ├── boot.js              # initCore, initWebGL, textureLoadAssets
│   ├── hooks.js             # onMount/onDestroy/onPageIn/onPageOut
│   ├── observe.js           # ObserverManager + onView (pooled IntersectionObserver)
│   ├── track.js             # onTrack — scroll progress 0-1 over a viewport sweep
│   ├── raf.js               # Unified RAF, priority subscriptions (Lenis=0, WebGL=1, perf=10)
│   └── resize.js            # Centralized debounced resize subscriptions
├── canvas/                  # WebGL layer
│   ├── index.js             # Canvas — renderer, camera, scene, page lifecycle
│   ├── Page.js              # Base class for WebGL pages (extends Emitter)
│   ├── DOMPlane.js          # DOM → WebGL plane mapping helper
│   ├── TransitionController.js  # Cross-page mesh clone + GSAP timeline composition
│   ├── shaders/             # Default shaders + GLSL includes
│   ├── utils/
│   │   ├── Time.js          # Render clock (driven by @core/raf, delta-clamped)
│   │   ├── TextureCache.js  # Singleton texture loader; resolves via publicAssetUrl
│   │   └── RendererPool.js  # Pooled WebGL contexts for own-canvas overlay effects
│   └── Home/                # Example WebGL page
├── transitions/             # Taxi-based routing
│   ├── index.js             # TransitionManager — wraps Taxi, runs lifecycle hooks
│   ├── Preloader.js         # Loading screen (loadAssets is injectable)
│   ├── global/GlobalEnter.js  # Default global enter transition
│   └── pages/               # Per-page transition classes (e.g. ProjectTrans)
├── components/              # Auto-discovered DOM components
│   ├── index.js             # Wraps discoverComponents/destroyComponents
│   └── discover.js          # import.meta.glob → registry by filename
├── animations/              # Scroll-driven DOM animations
│   ├── index.js             # Registry-based discovery (data-attr → class)
│   ├── AnimationCore.js     # Base: setup() + activate() split
│   └── global/              # FadeIn, HeadingReveal, ParaReveal, ImageReveal, ImageParallax, LineReveal
├── webflow/                 # Webflow-specific helpers
│   ├── detect-editor.js     # MutationObserver for w-editor-publish-node
│   └── reset-webflow.js     # Re-runs window.Webflow native JS after Taxi swaps
├── utils/                   # Standalone utilities
│   ├── Emitter.js           # Class + singleton event bus
│   ├── smoothscroll.js      # Lenis wrapper (singleton, registers on @core/raf)
│   ├── easings.js           # GSAP custom easings
│   ├── media.js             # prefersReducedMotion(), isMobile()
│   ├── math.js              # damp, lerp, clamp(v, min, max), map
│   ├── client-rect.js       # Enriched getBoundingClientRect
│   ├── public-asset.js      # Resolves paths against __PUBLIC_ASSET_ORIGIN__
│   ├── theme.js             # u-theme-* carry-over across Taxi swaps + theme:change
│   ├── nav.js               # updateActiveNav — is-active on matching [data-nav-link]
│   └── perf.js              # FPS overlay, frame drops, web vitals (auto-init; window.perf)
├── styles/                  # CSS outside Webflow
└── main.js                  # Entry — wire what you need, delete what you don't
```

## Lifecycle Hooks (`@core/hooks`)

The runtime contract every component, animation, and transition writes against. Modules push callbacks; the transition layer runs them at the right moment.

```js
import { onMount, onDestroy, onPageIn, onPageOut } from '@core/hooks'

onMount(() => { /* sync setup, after DOM swap, before user sees the page */ })
onDestroy(() => { /* sync teardown — listeners, timers, refs */ })
onPageIn(async () => { /* async, awaited; activate scroll animations here */ })
onPageOut(async () => { /* async, awaited; element-aware exit animations */ })
```

`runDestroy()` fires on every Taxi `onLeave` — that's the cleanup point. `runMount()`/`runPageIn()` fire on every Taxi `onEnter`. Each call drains the queue (no leftovers between pages).

## Auto-Discovery

### Components — `[data-component="name"]`

A file at `src/components/<anywhere>/<name>.js` exporting a default function is auto-mounted on every element with `data-component="<name>"`. The factory receives `(element, dataset)` and registers cleanup via `onDestroy`.

```js
// src/components/menu/menu.js
import { onDestroy } from '@core/hooks'

export default function menu(el, data) {
  const open = el.querySelector('[data-menu="open"]')
  const handler = () => el.classList.toggle('is-open')
  open.addEventListener('click', handler)
  onDestroy(() => open.removeEventListener('click', handler))
}
```

```html
<nav data-component="menu">
  <button data-menu="open">Menu</button>
</nav>
```

Discovery uses Vite's `import.meta.glob('./!(index|discover|_core)/**/*.js', { eager: true })`. The filename (lowercased) is the component name. Nested components work — both outer and inner `data-component` elements get discovered. Initialized elements are flagged so re-discovery is a no-op.

### Animations — registry-based

`src/animations/index.js` maps data-attribute → class. Add a new animation: drop a class file under `animations/global/...`, add one line to the registry.

```js
const REGISTRY = {
  'data-anim': {
    'fade-in': FadeIn,
    'line': LineReveal,
    'image-reveal': ImageReveal,
    'image-parallax': ImageParallax,
    'heading': HeadingReveal,
    'paragraph': ParaReveal,
  },
}
```

Each animation extends `AnimationCore`. Subclass overrides `animate()` to populate `this.timeline`. Optionally override `createElements()` to cache child queries, and assign `this.triggerElement` to use a non-default trigger.

**Lifecycle:** `setup()` builds the timeline (no ScrollTrigger). `activate()` creates the ScrollTrigger that drives it. `Animation` discovers + setups on construction; TransitionManager calls `activate()` after the page is ready (so scroll animations don't race the WebGL flight). `destroy()` is called on every page leave — there is no per-instance auto-cleanup.

`prefersReducedMotion()` is honored: when set, `setup()` early-returns and no timelines or ScrollTriggers are created.

## Modular Boot (`@core/boot`)

`main.js` is the wiring layer. Three composable helpers; no adapter pattern, just imports.

```js
import { initCore, initWebGL, textureLoadAssets } from '@core/boot'
import TransitionManager from '@transitions'
import Preloader from './transitions/Preloader'
import { Home } from '@canvas/Home'

initCore()                                  // SmoothScroll (Lenis) singleton
const canvas = initWebGL({ pages: { home: Home } })
const preloader = new Preloader({
  readySignal: 'home:enter-ready',
  loadAssets: textureLoadAssets,            // warms TextureCache
  onAppStart: () => new TransitionManager({ canvas }),
})
preloader.start().catch(...)
```

**To go DOM-only:** delete `initWebGL`, `Home`, and `loadAssets`. Three.js tree-shakes out. The Preloader's default `loadAssets` falls back to browser-native `new Image()` preloading, so it works with no WebGL imports.

**To skip Taxi:** delete `TransitionManager`, manually call `discoverComponents()` + `runMount()` after DOM is ready.

## Page Transitions

Per-page transition classes own ALL choreography — WebGL handles and DOM tweens compose onto ONE timeline per file, every duration/label visible top-to-bottom. `GlobalEnter` is the default crossfade (per-page pacing via `inDelay`/`inDuration`/`outDelay`/`outDuration` instance fields; `composeEnter(to, tl)` seam for reveals). Per-page classes may define `static initialEnter(view)` — TransitionManager calls it once at boot, since Taxi transitions never run on a hard load.

**Mesh flight** (cross-page image flights) is a pull-based API on `canvas.transitionController` — there is no `animate()` method and the controller emits nothing:

```js
// Source page, on link click (TransitionController listens for this):
emitter.emit('webgl:transition:prepare', { mesh, targetUrl, sourcePage })

// Destination page transition, synchronously inside onEnter:
const ctx = this.transitionController.getFlightContext(
	to.querySelector('[data-gl-target]').getBoundingClientRect(),
)
// ctx = { mesh, uniforms, sizeProxy, onSizeUpdate, world, cleanup } — raw
// GSAP-tweenable handles. ctx === null when no mesh was staged (no click,
// mobile, direct URL) — compose the DOM-only fallback on the same timeline.
```

**Position grammar** (GSAP-native, see `src/transitions/pages/ProjectTrans.js`): add the flight-duration spine tween first, then define labels with percent-of-previous syntax — `tl.addLabel('reveal', '<35%')` = 35% into the spine, `tl.addLabel('handoff', '>-20%')` = last 20%. TRAP: a bare `'35%'` position is NOT a percentage — GSAP creates a label literally named "35%" at the timeline's current end.

**WebGL page enter signal**: a page's `transitionIn` emits `<page>:intro-started` with `{ timeline, ...handles }` where handles are raw uniform objects (`{ value }` — plain GSAP targets). The per-page transition composes onto the live timeline; if nobody composes, the empty timeline completes immediately.

### Transition gotchas (all encoded in code — do NOT regress)

- **Taxi inits BEFORE Components/Animation** (TransitionManager constructor). Taxi snapshots the entry DOM into its page cache; if SplitText ran first, split markup gets cached and every SPA return re-splits it → nested masks.
- **`reloadCssFilter: false`** — Webflow's CDN can serve pages referencing different hashed builds of the same shared CSS; Taxi would append the stale stylesheet to `<body>` and its bare-element defaults win the cascade for the session.
- **Old views are swept from the live DOM** (`querySelectorAll('[data-taxi-view]')`, remove all but `to`) — never a cached `fromElement`, which desyncs under `removeOldContent: false`.
- **`.canvas` must live OUTSIDE `[data-taxi-view]`** or the first navigation removes the WebGL canvas with the old view (Canvas warns on boot).

## Webflow Integration

- HTML built and hosted in Webflow; this bundle loads via `<script>`.
- Entry waits for `window.Webflow` ready callback.
- `data-*` attributes hook JS to DOM (see table below).
- Taxi intercepts `<a>` links for SPA navigation; `resetWebflow()` runs after each swap so forms / tabs / sliders re-init.
- Editor mode: `handleEditor()` (MutationObserver on `body.firstElementChild`) pauses Lenis when the Designer is active.
- **Theme carry-over** (`@utils/theme`): pages author `u-theme-dark|light|brand` on `<body>` in Webflow. Taxi never swaps `<body>`, so on `NAVIGATE_IN` the manager reads the incoming document's body class and applies it to the live body, cross-fading via `body.is-theme-switching` (600ms window, `styles/theme.css`). WebGL follows via the `theme:change` event. Fallback: `data-theme` on the incoming view.
- **Active nav** (`@utils/nav`): `updateActiveNav()` toggles `is-active` on `a[data-nav-link]` whose path matches the URL — on boot and every `NAVIGATE_IN`.

## DOM Attributes

| Attribute | Purpose |
|---|---|
| `data-component="name"` | Auto-mount component file `<name>.js` on this element |
| `data-page="home"` | Identify the WebGL page for this URL |
| `data-gl="img"` | Mark image for DOMPlane mapping |
| `data-gl-src="..."` | Override texture source for DOMPlane |
| `data-gl-container` | Hover/click detection container for DOMPlane |
| `data-loader="wrapper"` | Preloader container |
| `data-loader="loader-num"` | Progress number display |
| `data-loader="progress-bar"` | Progress bar element |
| `data-gl-target` | Destination rect for a mesh flight (project page) |
| `data-taxi-view` | Taxi's swap target |
| `data-taxi-ignore` | Exclude link from Taxi SPA routing |
| `data-lenis-prevent` | Exclude element from Lenis smooth scroll |
| `data-nav-link` | Nav anchor — gets `is-active` when its path matches the URL |
| `data-theme="dark"` | Per-view theme fallback (primary source: `u-theme-*` on body) |
| `data-anim="fade-in"` | FadeIn |
| `data-anim="line"` | LineReveal |
| `data-anim="image-reveal"` | ImageReveal |
| `data-anim="image-parallax"` | ImageParallax (scrub) |
| `data-anim="heading"` | HeadingReveal (SplitText chars) |
| `data-anim="paragraph"` | ParaReveal (SplitText lines) |

## Global Events (`@utils/Emitter` singleton)

- `transition:start` — page navigation begins
- `transition:complete` — new page mounted, hooks done
- `home:enter-ready` — homepage WebGL created (Preloader `readySignal`)
- `home:intro-started` — `{ timeline, reveals }` composer signal from Home's `transitionIn`; per-page transitions compose reveals onto the live timeline
- `webgl:transition:prepare` — `{ mesh, targetUrl, sourcePage }` stages a mesh flight (TransitionController listens)
- `theme:change` — `{ theme, previous, animate }` from `@utils/theme` applyTheme()

## Path Aliases

```
@           → src
@core       → src/_core
@canvas     → src/canvas
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

`__PUBLIC_ASSET_ORIGIN__` (Vite `define`) controls the texture origin for cross-host setups. Set via `PUBLIC_ASSET_ORIGIN` env at build time.

## Performance Monitoring (`@utils/perf`)

Auto-starts via `_core/boot.js`. Runs on the unified RAF (priority 10 — sees end-of-frame timing).

```js
import perf from '@utils/perf'
perf.toggleFpsDisplay()         // also Shift+F (persists in localStorage)
perf.getMetrics()               // fps, frameTime, min, max, smoothness, budget
perf.getWebVitals()             // FCP, LCP, CLS via PerformanceObserver
perf.add('home:enter-ready')    // timing marker
perf.enableFrameDropDetection() // opt-in, tracks frames > 50ms
```

`smoothness` = 100 − (stddev/avg × 100). `budget` = % of frames under 16.67ms.

## Conventions

- Tabs for indentation, single quotes, trailing commas (see `.prettierrc`).
- GLSL imported via `vite-plugin-glsl` with `#include` support.
- Mobile WebGL guard: `prefersReducedMotion()` + `isMobile()` from `@utils/media`.
- Console logs stripped in production via terser.
- No TypeScript. Plain JS only.

## Claude Code Skills

| Command | Purpose |
|---|---|
| `/webgl-page` | Build new Page subclasses |
| `/dom-plane` | DOM-to-WebGL plane mapping |
| `/shader` | GLSL shaders |
| `/transition` | Page routing + transitions |
| `/scroll-anim` | Scroll animations (GSAP + ScrollTrigger + SplitText) |
| `/component` | Auto-discovered DOM components |
| `/perf-audit` | 60fps audit checklist |
| `/webflow` | Webflow integration |
| `/debug` | Symptom-to-diagnosis guide |
| `/new-project` | Bootstrap a new project |
