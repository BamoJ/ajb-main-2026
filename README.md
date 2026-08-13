# WebGL + Webflow Boilerplate

A reusable starter for Webflow sites with custom WebGL experiences. Built with Three.js, GSAP, Taxi (page routing), and Lenis (smooth scroll). HTML lives in Webflow — this repo is the JS/WebGL layer injected via `<script>`.

## Core Features

### 1. WebGL Engine (`canvas/`)
- **Page System** — universal base class for every WebGL page
  - Full lifecycle: `create() → onEnter() → update() → onLeave() → destroy()`
  - Scene management via `this.elements` (THREE.Group)
  - Extends Emitter for internal events
  - Works for any experience: DOM-mapped planes, particles, 3D scenes

- **DOMPlane** — optional helper to map DOM elements → WebGL planes
  - Creates PlaneGeometry sized to match DOM element's bounding rect
  - Converts DOM pixels → WebGL world coordinates (FOV-based)
  - Syncs position every frame (scroll, layout changes)
  - Hover system: mouseenter/leave/move with velocity tracking → shader uniforms
  - Works with images, videos, or any element with a bounding rect
  - AbortController for clean event listener teardown

- **TransitionController** — seamless cross-page WebGL transitions
  - Clones source mesh, hides original
  - Animates cloned mesh to target DOM position (1.5s expo.inOut)
  - UV correction for object-fit:cover during size transitions
  - Handoff: WebGL plane fades out, HTML image fades in
  - State machine: Idle → Preparing → Waiting → Animating → Complete

- **Default Shaders**
  - Vertex: deformation curve, paper ripple transition, perlin noise, reveal effect
  - Fragment: depth parallax, RGB shift along mouse direction
  - Shared GLSL includes (perlin noise)

### 2. Unified Event System (`utils/Emitter.js`)
Single event system replacing the old dual EventBus + EventEmitter:
- **As a class**: `class Time extends Emitter` — for Page, Time lifecycle events
- **As a singleton**: `import emitter from '@utils/Emitter'` — for global signals
- API: `on()`, `once()`, `off()`, `emit()`, `clear()`
- Namespace support for grouped cleanup: `emitter.off('tick', null, 'myView')`
- ~80 lines, flat map lookup (optimized for RAF tick every frame)

### 3. Page Routing (`transitions/`)
- **TransitionManager** — wraps Taxi with shared orchestration logic
  - Stop/start smooth scroll on navigate
  - Emit `transition:start` / `transition:complete` events
  - Trigger Canvas page swap (WebGL)
  - Reinitialize DOM components after navigation
  - Config-based: accepts `pages` and `pageTransitions` registries

- **Preloader** — loading screen skeleton
  - Tracks real loading progress (texture preloading)
  - RAF-based smooth progress ticker
  - Configurable `readySignal` (e.g. `'home:enter-ready'`)
  - Customizable exit animation

- **GlobalEnter** — default page enter transition (fade out/in)

### 4. Scroll Animations (`animations/`)
- **AnimationCore** — base class for scroll-driven DOM animations
  - GSAP timeline + ScrollTrigger integration
  - `setup()` builds the timeline; `activate()` creates the ScrollTrigger after the page is ready
  - Page-level `Animation.destroy()` tears down on every leave
- **Built-in animations**: FadeIn, LineReveal, ImageReveal, ImageParallax, HeadingReveal, ParaReveal
- Triggered via `data-anim="<value>"` attributes on DOM elements (e.g. `data-anim="heading"`, `data-anim="paragraph"`)
- Honors `prefersReducedMotion()` — `setup()` early-returns

### 5. Component Architecture (`components/`)
- **Auto-discovered factories** — drop `src/components/<anywhere>/<name>.js` exporting a default function; every `[data-component="<name>"]` element mounts on page enter.
- Factory receives `(element, dataset)`. Cleanup is registered via `onDestroy(...)` from `@core/hooks`.
- No base class — no inheritance. Stateful components can still wrap a class internally.

### 6. Utilities
- **SmoothScroll** — Lenis wrapper (singleton) with ScrollTrigger integration
- **TextureCache** — singleton texture loader with cache + dedup
- **Time** — RAF timer (extends Emitter, emits `tick`)
- **Easings** — GSAP CustomEase presets

## Project Structure
```
src/
├── _core/                         # Foundation — sorts to top of src/
│   ├── boot.js                    # initCore, initWebGL, textureLoadAssets
│   ├── hooks.js                   # onMount/onDestroy/onPageIn/onPageOut
│   ├── observe.js                 # ObserverManager + onView (pooled IO)
│   ├── track.js                   # onTrack — scroll progress 0-1 over a viewport sweep
│   ├── raf.js                     # Unified RAF (Lenis=0, WebGL=1, perf=10)
│   └── resize.js                  # Centralized debounced resize subscriptions
│
├── canvas/                        # All WebGL logic
│   ├── index.js                   # Canvas manager (renderer, camera, page lifecycle)
│   ├── Page.js                    # Base class for all WebGL pages
│   ├── DOMPlane.js                # Helper: DOM elements → WebGL planes
│   ├── TransitionController.js    # Cross-page mesh transitions
│   ├── shaders/                   # Default/shared shaders + GLSL includes
│   ├── utils/
│   │   ├── Time.js                # Render clock (driven by @core/raf)
│   │   └── TextureCache.js        # Singleton texture loader with cache
│   └── Home/                      # Example page — replace per project
│
├── transitions/                   # Page routing + transitions
│   ├── index.js                   # TransitionManager (Taxi wrapper)
│   ├── Preloader.js               # Loading screen (loadAssets injectable)
│   ├── global/GlobalEnter.js      # Default enter transition
│   └── pages/                     # Per-page transition classes
│
├── components/                    # Auto-discovered DOM components
│   ├── index.js                   # Wraps discoverComponents/destroyComponents
│   └── discover.js                # import.meta.glob → registry by filename
│
├── animations/                    # Scroll-driven DOM animations
│   ├── index.js                   # Registry-based discovery (data-attr → class)
│   ├── AnimationCore.js           # Base: setup() + activate() split
│   └── global/                    # FadeIn, LineReveal, ImageReveal, ImageParallax, HeadingReveal, ParaReveal
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
│   ├── client-rect.js             # Enriched getBoundingClientRect
│   ├── public-asset.js            # Resolves paths against __PUBLIC_ASSET_ORIGIN__
│   └── perf.js                    # FPS overlay, frame drops, web vitals
│
├── styles/                        # Extra CSS outside Webflow
│   ├── index.css                  # Style entry point
│   ├── base.css                   # .is-transition class for Taxi
│   ├── lenis.css                  # Smooth scroll overrides
│   └── easings.css                # CSS easing custom properties
│
└── main.js                        # Entry — wire what you need, delete what you don't
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

**Wins vs. the previous loader:**

- No manual `?dev=true` needed on staging — `*.webflow.io` auto-enables dev mode (covers ~99% of dev work).
- Escape hatch (`?dev=true`) still works for prod-domain debugging.
- Dev path preloads the Vercel bundle so the fallback is near-instant when the dev server is off.
- Production-domain visits are clean: no preload, no fallback logic, just the Vercel script.
- `onerror` clears `sessionStorage` so a failed dev session can't get stuck.

**Notes:**

- `cors: true` in `vite.config.js` is required for cross-origin loading from the Webflow domain (already present).
- **Exit dev mode on prod domain:** close the tab, clear `sessionStorage.localDev`, or navigate without `?dev=true`.
- For cross-host asset URLs (textures, etc. served from a separate origin), set `PUBLIC_ASSET_ORIGIN` at build time so `publicAssetUrl()` resolves them correctly.

### 5. Wiring `main.js`

`main.js` composes three helpers from `@core/boot` — no adapter pattern, just imports.

```js
import '@styles/index.css';
import { initCore, initWebGL, textureLoadAssets } from '@core/boot';
import TransitionManager from '@transitions';
import Preloader from './transitions/Preloader';
import { Home } from '@canvas/Home';

const pages = { home: Home };
const pageTransitions = { /* project: ProjectTrans */ };

initCore();                                  // SmoothScroll (Lenis) singleton
const canvas = initWebGL({ pages });

const preloader = new Preloader({
  readySignal: 'home:enter-ready',
  loadAssets: textureLoadAssets,             // warms TextureCache
  onAppStart: () => new TransitionManager({ canvas, pageTransitions }),
});

preloader.start().catch(console.error);
```

**To go DOM-only:** drop `initWebGL`, `Home`, and `loadAssets`. Three.js tree-shakes out — Preloader's default `loadAssets` falls back to `new Image()` preloading.

**To skip Taxi:** drop `TransitionManager`, manually call `discoverComponents()` + `runMount()` once DOM is ready.

### 6. Adding a New WebGL Page

Create your page class:
```js
// src/canvas/YourPage/index.js
import { Page } from '../Page';

export class YourPage extends Page {
  create(template) { /* setup WebGL */ }
  update(time) { /* per-frame logic */ }
  onResize() { /* handle resize */ }
}
```

Register in `src/main.js`:
```js
import { YourPage } from '@canvas/YourPage';
const pages = { home: Home, yourpage: YourPage };
```

Add page identifier in Webflow:
```html
<body data-page="yourpage">
```

### 7. Adding a Component

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

### 8. Using DOMPlane for Image/Video WebGL

```js
import { DOMPlane } from '../DOMPlane';

class MyView extends DOMPlane {
  constructor(options) {
    super({ ...options, shaders: { vertex: vert, fragment: frag } });
    this.loadImages();
  }

  onHoverEnter(mesh) {
    // Animate shader uniforms on hover
    gsap.to(mesh.material.uniforms.uReveal, { value: 1 });
  }

  onHoverLeave(mesh) {
    gsap.to(mesh.material.uniforms.uReveal, { value: 0 });
  }
}
```

Mark DOM elements for WebGL mapping:
```html
<div data-gl-container>
  <img data-gl="img" src="..." />
</div>
```

### 9. Page-Specific Transitions (Optional)

```js
// src/transitions/pages/YourPageTrans.js
import { Transition } from '@unseenco/taxi';

export default class YourPageTransition extends Transition {
  onLeave({ from, trigger, done }) { done(); }
  onEnter({ to, trigger }, animationComplete) {
    // Your GSAP animation
    animationComplete();
  }
}
```

Register: `const pageTransitions = { yourpage: YourPageTransition };`

## Global Events

Via the singleton emitter (`import emitter from '@utils/Emitter'`):

| Event | When |
|---|---|
| `transition:start` | Page navigation begins |
| `transition:complete` | New page loaded, components initialized |
| `home:enter-ready` | Homepage WebGL created (Preloader `readySignal`) |
| `home:intro-started` | `{ timeline, reveals }` — compose enter reveals onto the live timeline |
| `webgl:transition:prepare` | `{ mesh, targetUrl, sourcePage }` — stages a mesh flight; the destination page transition pulls it via `transitionController.getFlightContext(rect)` |
| `theme:change` | `{ theme, previous, animate }` — body theme switched (`@utils/theme`) |

## DOM Attributes

| Attribute | Purpose |
|---|---|
| `data-component="name"` | Auto-mount component file `<name>.js` on this element |
| `data-page="home"` | Identifies which WebGL page to load |
| `data-gl="img"` | Marks an image for WebGL plane mapping |
| `data-gl-src="..."` | Override image source for WebGL texture |
| `data-gl-container` | Parent container for hover detection |
| `data-loader="wrapper"` | Preloader container |
| `data-loader="loader-num"` | Progress number display |
| `data-loader="progress-bar"` | Progress bar element |
| `data-gl-target` | Destination rect for a mesh flight (detail page) |
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

## Conventions
- Tabs for indentation, single quotes, trailing commas (see `.prettierrc`)
- GLSL shaders imported via `vite-plugin-glsl` with `#include` support
- Mobile WebGL guard: `prefersReducedMotion()` + `isMobile()` from `@utils/media`
- Console logs stripped in production build via terser
- No TypeScript. Plain JS only.

### Path Aliases

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

## Claude Code Skills

10 custom skills in `.claude/skills/` for Claude Code users:

| Command | Purpose |
|---------|---------|
| `/webgl-page` | Build new Page subclasses (lifecycle, scene, viewport) |
| `/dom-plane` | DOM-to-WebGL plane mapping (DOMPlane, hover, textures) |
| `/shader` | GLSL shaders (write, debug, uniforms, includes) |
| `/transition` | Page routing (Taxi + TransitionController + Lenis) |
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
