# Webflow Motion Toolkit

The JS motion layer for a Webflow site (`ajb-main-2026`). Built with GSAP, Taxi (page routing), and Lenis (smooth scroll). HTML lives in Webflow — this repo is the JS layer injected via `<script>`. DOM-only: no WebGL, no Three.js.

## Core Features

### 1. Page Routing + Transitions (`transitions/`)
- **TransitionManager** — wraps Taxi with shared orchestration logic
	- Stop/start smooth scroll around every navigation
	- Emit `transition:start` / `transition:complete` events
	- Snap-bug-free re-init order: the incoming view is set to `opacity: 0` and its animations are built BEFORE the crossfade, so hidden states (SplitText, `from()` sets) land invisibly; after the fade the manager adopts them and `activate()`s the ScrollTriggers
	- Live-DOM view sweep after each fade (never a cached `fromElement`), `reloadCssFilter: false`, theme + active-nav hooks on `NAVIGATE_IN`
	- Options: `{ pageTransitions = {}, deferInitial = false }`. `initialEnter()` arms ScrollTriggers, starts scroll, and plays the hard-load hero enter — the constructor runs it immediately unless `deferInitial` (the loader path calls it after fade-out)
	- `detectPageName` is attribute-only: `data-page` on the view or a descendant. No URL fallback.

- **GlobalEnter** — one file, the whole default transition: crossfade (old view out 0.5s, new view in 1s at `0.2`) plus `composeHeroEnter` (same file, bottom), the shared first impression on SPA nav AND hard load. All timing is inline in the tweens. `composeEnter(to, tl)` is the seam a per-page class overrides for bespoke reveals.
	- `[data-hero-image]` clips open bottom→top (`inset(100% 0% 0% 0%)`, 1.5s `power4.inOut`) — the visual kicks first, at `0.2`
	- `[data-hero-heading]` SplitText lines rise out of masks (`yPercent: 120`, 1.2s `power3.out`, stagger 0.08) at `'>'`
	- `[data-hero-content]` fades in (`opacity`, 1s `sine.out`) at `'<50%'`
	- Pages without the hooks degrade to the plain crossfade

- **Preloader** — hard-load loading screen
	- Tracks real loading progress (default: browser-native `new Image()` preload of the page's images; `loadAssets(onProgress)` injectable)
	- RAF-based smooth progress ticker, headless-capable via `onProgress(0..1)`
	- `onAppStart` runs behind the still-opaque overlay; `onComplete` fires after the overlay has fully faded out
	- Customizable exit animation (`animateOut`)

### 2. Scroll Animations (`animations/`)
- **AnimationCore** — base class for scroll-driven DOM animations
	- GSAP timeline + ScrollTrigger integration
	- `setup()` builds the timeline; `activate()` creates the ScrollTrigger after the page is ready
	- Page-level `Animation.destroy()` tears down on every leave
- **Built-in animations**: FadeIn, LineReveal, ImageReveal, ImageParallax, HeadingReveal, ParaReveal — plus project scroll pieces HeroScroll (home hero) and ArtworkHero/ArtworkGallery (artwork page)
- Triggered via `data-anim="<value>"` attributes — MUST be inside `[data-taxi-view]` (the manager scopes pre-fade setup to the incoming view)
- Honors `prefersReducedMotion()` — `setup()` early-returns

### 3. Component Architecture (`components/`)
- **Auto-discovered factories** — drop `src/components/<anywhere>/<name>.js` exporting a default function; every `[data-component="<name>"]` element mounts on page enter.
- Factory receives `(element, dataset)`. Cleanup is registered via `onDestroy(...)` from `@core/hooks`.
- No base class — no inheritance. Stateful components can still wrap a class internally.

### 4. Unified Event System (`utils/Emitter.js`)
- **As a class**: `class Foo extends Emitter` — for internal lifecycle events
- **As a singleton**: `import emitter from '@utils/Emitter'` — for global signals
- API: `on()`, `once()`, `off()`, `emit()`, `clear()`
- Namespace support for grouped cleanup: `emitter.off('tick', null, 'myView')`

### 5. Utilities
- **SmoothScroll** — Lenis wrapper (singleton) with ScrollTrigger integration
- **Theme** — `u-theme-*` body-class carry-over across Taxi swaps, cross-faded (`@utils/theme` + `styles/theme.css`), `theme:change` event
- **Active nav** — `is-active` on `a[data-nav-link]` whose path matches the URL (`@utils/nav`)
- **Perf** — FPS overlay (Shift+F), frame drops, web vitals (`@utils/perf`, auto-init)
- **Easings** — GSAP CustomEase presets

## Project Structure
```
src/
├── _core/                         # Foundation — sorts to top of src/
│   ├── boot.js                    # initCore — SmoothScroll singleton (+ perf auto-init)
│   ├── hooks.js                   # onMount/onDestroy/onPageIn/onPageOut
│   ├── observe.js                 # ObserverManager + onView (pooled IO)
│   ├── track.js                   # onTrack — scroll progress 0-1 over a viewport sweep
│   ├── raf.js                     # Unified RAF (Lenis=0, perf=10)
│   └── resize.js                  # Centralized debounced resize subscriptions
│
├── transitions/                   # Page routing + transitions
│   ├── index.js                   # TransitionManager (Taxi wrapper)
│   ├── Preloader.js               # Hard-load loading screen (loadAssets injectable)
│   └── global/
│       └── GlobalEnter.js         # Default crossfade + shared hero enter
│
├── components/                    # Auto-discovered DOM components
│   ├── index.js                   # Wraps discoverComponents/destroyComponents
│   ├── discover.js                # import.meta.glob → registry by filename
│   ├── art-hover/                 # Home featured artworks — entrance + hover
│   ├── artwork-list-hover/        # /artwork list — big-thumb hover reveal
│   └── mobile-menu/               # Mobile menu
│
├── animations/                    # Scroll-driven DOM animations
│   ├── index.js                   # Registry-based discovery (data-attr → class)
│   ├── AnimationCore.js           # Base: setup() + activate() split
│   ├── global/                    # FadeIn, LineReveal, ImageReveal, ImageParallax, HeadingReveal, ParaReveal
│   └── scroll/                    # HeroScroll (home), ArtworkScroll (artwork hero + gallery)
│
├── webflow/                       # Webflow-specific helpers
│   ├── detect-editor.js           # MutationObserver for w-editor-publish-node
│   └── reset-webflow.js           # Re-runs window.Webflow native JS after Taxi swaps
│
├── utils/                         # Global utilities
│   ├── Emitter.js                 # Class + singleton event bus
│   ├── smoothscroll.js            # Lenis wrapper (registers on @core/raf)
│   ├── easings.js                 # GSAP custom easings
│   ├── media.js                   # prefersReducedMotion(), isMobile()
│   ├── math.js                    # damp, lerp, clamp, map
│   ├── theme.js                   # u-theme-* carry-over + theme:change
│   ├── nav.js                     # updateActiveNav — is-active on [data-nav-link]
│   └── perf.js                    # FPS overlay, frame drops, web vitals
│
├── styles/                        # Extra CSS outside Webflow
│   ├── index.css                  # Style entry point
│   ├── base.css                   # .is-transition class for Taxi
│   ├── lenis.css                  # Smooth scroll overrides
│   ├── theme.css                  # Theme cross-fade (.is-theme-switching)
│   └── easings.css                # CSS easing custom properties
│
└── main.js                        # Entry — Webflow ready → loader boot or immediate boot
```

## Usage

### 1. Installation
```bash
bun install
```

### 2. Development
```bash
bun run dev
```

### 3. Production Build
```bash
bun run build
```
Outputs `dist/main.js` — single IIFE bundle with CSS inlined.

Deploy `dist/main.js` to Vercel (or any static host). The production URL goes into the Webflow script snippet below.

### 4. Webflow Integration

Add to your Webflow project settings (Site Level), custom code before `</head>`:

**Hybrid auto-switching loader:**

Replace `{YOUR_VERCEL_URL}` with your deployment (e.g. `https://your-project.vercel.app`).

```html
<script>
(function (d, h, host) {
	var isWF = host.endsWith('.webflow.io');
	var isDevParam = new URLSearchParams(location.search).get('dev') === 'true';
	if (isDevParam) sessionStorage.setItem('localDev', 'true');
	var hasDevFlag = sessionStorage.getItem('localDev') === 'true';
	var useDev = isWF || hasDevFlag;

	var DEP = '{YOUR_VERCEL_URL}';
	var LOC = 'http://localhost:3000';
	var js = 'main.js';

	function loadScript(src, cors, isModule) {
		var s = d.createElement('script');
		s.src = src;
		if (isModule) s.type = 'module';
		else s.defer = 1;
		if (cors) s.crossOrigin = 'anonymous';
		h.appendChild(s);
		return s;
	}

	// Production path — direct to Vercel, no fallback logic.
	if (!useDev) {
		loadScript(DEP + '/' + js, true);
		return;
	}

	// Dev path — preload the Vercel bundle so the fallback is instant.
	var p = d.createElement('link');
	p.rel = 'preload'; p.as = 'script';
	p.href = DEP + '/' + js; p.crossOrigin = 'anonymous';
	h.appendChild(p);

	// Inject Vite HMR client (module type required).
	loadScript(LOC + '/@vite/client', false, true);

	// Try localhost; fall back to Vercel on error.
	var s = loadScript(LOC + '/src/' + js, false, true);
	s.onerror = function () {
		sessionStorage.removeItem('localDev');
		loadScript(DEP + '/' + js, true);
	};
})(document, document.head, location.hostname);
</script>
```

**Behavior matrix:**

| Domain | Dev server | `?dev=true` | Result |
|---|---|---|---|
| `*.webflow.io` (staging) | running | — | localhost (HMR) |
| `*.webflow.io` (staging) | off | — | Vercel (auto-fallback) |
| Production domain | running | no | Vercel (direct, fastest) |
| Production domain | running | yes | localhost (HMR) |
| Production domain | off | yes | Vercel (fallback fires, sessionStorage cleared) |
| Production domain | — | no | Vercel (direct) |

**Notes:**

- `cors: true` in `vite.config.js` is required for cross-origin loading from the Webflow domain (already present).
- **Exit dev mode on prod domain:** close the tab, clear `sessionStorage.localDev`, or navigate without `?dev=true`.

### 5. Wiring `main.js`

`main.js` waits for Webflow's ready callback, then boots one of two ways: through the Preloader when the page has a `[data-loader="wrapper"]` overlay, or immediately when it doesn't.

```js
import '@styles/index.css';
import { initCore } from '@core/boot';
import TransitionManager from '@transitions';
import Preloader from '@transitions/Preloader';

// Per-page transition classes are OPTIONAL — every page already gets
// GlobalEnter's crossfade + the shared hero enter. Register here only
// when a page needs bespoke choreography.
const pageTransitions = {};

window.Webflow ||= [];
window.Webflow.push(() => {
	const scroll = initCore();

	if (document.querySelector('[data-loader="wrapper"]')) {
		let manager;
		scroll.stopScroll();
		new Preloader({
			// Behind the still-opaque overlay: Taxi cache seed, component
			// mount, animation setup (hidden states) all land invisibly.
			onAppStart: () => {
				manager = new TransitionManager({
					pageTransitions,
					deferInitial: true,
				});
			},
			// After the overlay fades out: arm ScrollTriggers, start
			// scroll, play the hero enter.
			onComplete: () => manager.initialEnter(),
		})
			.start()
			.catch(/* hide overlay, startScroll, initialEnter — never brick */);
	} else {
		new TransitionManager({ pageTransitions });
	}
});
```

### 6. The Loader (hard load)

Author the overlay in Webflow — fixed, fullscreen, opaque, **visible by default** (it must already cover the page before any JS runs; JS hides it, never shows it late).

| Attribute | Purpose |
|---|---|
| `data-loader="wrapper"` | The overlay itself — fixed fullscreen, authored visible |
| `data-loader="loader-num"` | Progress number display (optional, inside wrapper) |
| `data-loader="progress-bar"` | Progress bar — JS drives `width` 0→100% (optional, inside wrapper) |

Boot sequence: scroll stops → images preload with smoothed progress → `onAppStart` constructs the TransitionManager behind the overlay (`deferInitial: true`) → overlay fades out (`animateOut`, override per project) → `onComplete` runs `manager.initialEnter()`. If boot fails, the `.catch` hides the overlay and starts scroll so the site is never stuck behind it. No wrapper in the DOM → the Preloader is skipped entirely and the site boots immediately.

### 7. Shared Hero Enter

Three optional Webflow-authored hooks per page, played on every SPA navigation (via `GlobalEnter.composeEnter`) and on hard load (via the manager's initial-enter timeline). Lives at the bottom of `transitions/global/GlobalEnter.js`:

```html
<div data-hero-image>...</div>
<h1 data-hero-heading>...</h1>
<div data-hero-content>...</div>
```

- `data-hero-image` — clips open bottom→top (1.5s `power4.inOut`) — the visual kicks first
- `data-hero-heading` — SplitText lines rise out of masks (`yPercent: 120`, stagger 0.08), after the visual lands
- `data-hero-content` — fades in, halfway into the heading rise

Rules:
- A hero-tagged element must NOT also carry `data-anim` — two owners would fight over the same element.
- The hero enter only writes `opacity` / `yPercent` / `clip-path`. Scrub animations on the same elements (e.g. HeroScroll owns `y`/`scale` on the home hero) stay off those channels.
- Pages without the hooks simply get the plain crossfade.

### 8. Adding a Component

Drop a file at `src/components/<anywhere>/<name>.js` exporting a default function. Every element with `data-component="<name>"` is auto-mounted on page enter; cleanup runs on page leave.

```js
// src/components/menu/menu.js
import { onDestroy } from '@core/hooks';

export default function menu(el, data) {
	const open = el.querySelector('[data-menu="open"]');
	const handler = () => el.classList.toggle('is-open');
	open.addEventListener('click', handler);
	onDestroy(() => open.removeEventListener('click', handler));
}
```

```html
<nav data-component="menu">
	<button data-menu="open">Menu</button>
</nav>
```

The factory receives `(element, dataset)`. Filename (lowercased) is the component name. Nested components work — outer and inner `data-component` elements both discover.

### 9. Page-Specific Transitions (Optional)

The registry in `main.js` is empty by default — a page only gets a class if it needs choreography beyond the crossfade + hero enter. Extend `GlobalEnter` and override the seam:

```js
// src/transitions/pages/YourPageTrans.js
import GlobalTransition from '@transitions/global/GlobalEnter';

export default class YourPageTransition extends GlobalTransition {
	// Optional pacing overrides:
	// inDelay = 0.5; inDuration = 1.2; outDelay = 0; outDuration = 0.4;

	composeEnter(to, tl) {
		// Bespoke reveals on the live crossfade timeline (replaces the
		// shared hero enter for this page).
	}

	// Optional hard-load seam — Taxi transitions never run on a hard
	// load, so the manager calls this once at boot:
	// static initialEnter(view) { ... }
}
```

Register in `main.js`, keyed by the page's `data-page` value:

```js
const pageTransitions = { yourpage: YourPageTransition };
```

## Global Events

Via the singleton emitter (`import emitter from '@utils/Emitter'`):

| Event | When |
|---|---|
| `transition:start` | Page navigation begins |
| `transition:complete` | New page loaded, components initialized |
| `theme:change` | `{ theme, previous, animate }` — body theme switched (`@utils/theme`) |

## DOM Attributes

| Attribute | Purpose |
|---|---|
| `data-component="name"` | Auto-mount component file `<name>.js` on this element |
| `data-page="home"` | Page name for per-page transition dispatch (on the view or a descendant) |
| `data-loader="wrapper"` | Preloader overlay (fixed fullscreen, authored visible) |
| `data-loader="loader-num"` | Progress number display |
| `data-loader="progress-bar"` | Progress bar element |
| `data-hero-image` | Shared hero enter — clips open bottom→top (first beat) |
| `data-hero-heading` | Shared hero enter — SplitText lines rise |
| `data-hero-content` | Shared hero enter — fades in |
| `data-taxi-view` | Taxi page view container (what gets swapped) |
| `data-taxi-ignore` | Exclude link from Taxi routing |
| `data-lenis-prevent` | Exclude element from smooth scroll |
| `data-nav-link` | Nav anchor — gets `is-active` when its path matches the URL |
| `data-theme="dark"` | Per-view theme fallback (primary: `u-theme-*` class on body) |
| `data-anim="fade-in"` | FadeIn scroll animation |
| `data-anim="line"` | LineReveal (scaleX wipe) |
| `data-anim="image-reveal"` | ImageReveal (clip wipe from right) |
| `data-anim="image-parallax"` | ImageParallax (scrub parallax) |
| `data-anim="heading"` | HeadingReveal (SplitText chars slide up) |
| `data-anim="paragraph"` | ParaReveal (SplitText lines slide up) |
| `data-anim="hero-scroll"` | HeroScroll — home hero grow-and-pan scrub |
| `data-anim="artwork-hero"` | ArtworkHero — artwork page hero scrub |
| `data-anim="artwork-gallery"` | ArtworkGallery — artwork page gallery pin |

Constraints:
- `data-anim` must only be used INSIDE `[data-taxi-view]` — the manager builds the incoming view's animations pre-fade, scoped to that view.
- An element with `data-hero-heading` / `data-hero-image` must not also carry `data-anim`.

## CSS Features

### Easing Variables
Complete set of cubic-bezier easings available as CSS custom properties:
```css
var(--ease-out-expo)
var(--ease-in-out-quart)
var(--gleasing)
/* ... and more */
```

### Smooth Scroll
Lenis integration with automatic ScrollTrigger sync.

### Theme Cross-Fade
`styles/theme.css` — `body.is-theme-switching` eases color changes when `u-theme-*` carries over on navigation.

## Conventions
- Tabs for indentation, single quotes, trailing commas (see `.prettierrc`)
- Motion guards: `prefersReducedMotion()` + `isMobile()` from `@utils/media`
- Console logs stripped in production build via terser
- No TypeScript. Plain JS only.

### Path Aliases

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

## Claude Code Skills

7 custom skills in `.claude/skills/` for Claude Code users:

| Command | Purpose |
|---------|---------|
| `/transition` | Page routing + transitions (Taxi + Lenis) |
| `/scroll-anim` | Scroll animations (GSAP + ScrollTrigger + SplitText) |
| `/component` | DOM components with Taxi lifecycle |
| `/perf-audit` | 60fps audit checklist across all browsers |
| `/webflow` | Webflow integration (data attributes, script loading) |
| `/debug` | Symptom-to-diagnosis troubleshooting guide |
| `/new-project` | Bootstrap new project from this starter |

## Browser Support
Modern browsers (Chrome, Firefox, Safari, Edge).

## License
MIT
