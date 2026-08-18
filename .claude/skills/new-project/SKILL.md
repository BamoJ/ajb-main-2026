---
name: new-project
description: Bootstrap a new project from this starter. Use when cloning the starter for a new client site, scaffolding pages, registering routes, and setting up Webflow data attributes.
user-invocable: true
---

# New Project — Bootstrap from Starter

## Step-by-Step Checklist

### 1. Clone and Configure

```bash
# Clone the starter
git clone <starter-repo-url> <project-name>
cd <project-name>

# Update package.json
# Change "name" to your project name

# Install dependencies
bun install
```

### 2. Identify Pages from Webflow

List all pages in your Webflow site. Every page gets Taxi routing, GlobalEnter's crossfade + the shared hero enter, and scroll animations automatically — no per-page class needed.

Common pages:
- `home` — homepage
- `work` — project listing
- `project` — individual project detail
- `about` — about page
- `contact` — contact page

Give each page a `data-page` attribute in Webflow (on `<body>` or the view wrapper). `detectPageName()` reads it to dispatch per-page transitions — there is no URL fallback.

### 3. Set Up Webflow Data Attributes

In Webflow, add these attributes to your elements:

**On every page's `<body>` or main wrapper:**
```html
<body data-page="home">
```

**On the content wrapper (for Taxi):**
```html
<div data-taxi-view>
  <!-- page content -->
</div>
```

**On images that need WebGL:**
```html
<div data-gl-container>
  <a href="/work/project-slug">
    <img data-gl="img" src="image.jpg" />
  </a>
</div>
```

**On the preloader:**
```html
<div data-loader="wrapper">
  <span data-loader="loader-num">0</span>
  <div data-loader="progress-bar"></div>
</div>
```

**On animated elements:**
```html
<h1 data-anim="heading">Title</h1>
<p data-anim="paragraph">Body text</p>
<img data-anim="image-parallax" src="bg.jpg" />
```

**Canvas container (fixed, full-screen):**
```html
<div class="canvas"></div>
```

### 6. Configure Preloader

In `src/main.js`, wire up `initCore`/`initWebGL` from `@core/boot`, then create the Preloader with a `readySignal` and `loadAssets`:

```js
import { initCore, initWebGL, textureLoadAssets } from '@core/boot';
import TransitionManager from '@transitions';
import Preloader from './transitions/Preloader';
import { Home } from '@canvas/Home';

initCore();
const canvas = initWebGL({ pages: { home: Home } });

const preloader = new Preloader({
  readySignal: 'home:enter-ready',
  loadAssets: textureLoadAssets,        // warms TextureCache; default uses browser-native Image preloading
  onAppStart: () => new TransitionManager({ canvas, pageTransitions }),
});
preloader.start().catch(...);
```

Your homepage must emit this signal:
```js
// In your Home page's create() or onEnter()
setTimeout(() => {
  emitter.emit('home:enter-ready');
}, 0);
```

### 7. Add Page-Specific Transitions (Optional)

If a page needs a custom transition instead of the default fade:

```js
// src/transitions/pages/ProjectTransition.js
import { Transition } from '@unseenco/taxi';

export default class ProjectTransition extends Transition {
  onLeave({ from, trigger, done }) {
    gsap.to(from, {
      opacity: 0,
      y: -50,
      duration: 0.6,
      ease: 'power2.in',
      onComplete: done,
    });
  }

  onEnter({ to, from, done }) {
    gsap.fromTo(to,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out',
        onComplete: done,
      }
    );
  }
}
```

Register in main.js:
```js
import ProjectTransition from '@transitions/pages/ProjectTransition';

const pageTransitions = {
  project: ProjectTransition,
};
```

### 8. Set Up Components

Components are auto-discovered. Drop a file at `src/components/<anywhere>/<name>.js` exporting a default function — it's auto-mounted on every element with `data-component="<name>"`. No manual registry edits.

```js
// src/components/menu/menu.js
import { onDestroy } from '@core/hooks';
import { isMobile } from '@utils/media';

export default function menu(el, data) {
  if (isMobile()) return;  // skip on mobile if needed

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

For stateful components, the factory wraps a class — see `src/components/index.js` docstring and the `/component` skill.

### 9. Add Custom Animations (Optional)

For project-specific scroll animations:

```js
// src/animations/global/yourEffect/YourEffect.js
import AnimationCore from '@animations/AnimationCore';

export default class YourEffect extends AnimationCore {
  constructor(element) {
    super(element, { duration: 1.2, ease: 'power3.out' });
    // No init() call — Animation manager calls setup() at discovery,
    // and TransitionManager calls activate() once the page is ready.
  }

  animate() {
    this.timeline.from(this.element, {
      autoAlpha: 0,
      y: 30,
      duration: this.options.duration,
      ease: this.options.ease,
    });
  }
}
```

Register in `src/animations/index.js` by adding one line under the `data-anim` entry of the `REGISTRY` map (e.g., `'your-effect': YourEffect`). Then in Webflow: `<div data-anim="your-effect">`.

### 10. Build and Test

```bash
# Dev server with HMR
bun run dev

# In Webflow custom code, add:
# <script src="http://localhost:3000/src/main.js" type="module"></script>

# Production build
bun run build
# Upload dist/main.js to your CDN
# Update Webflow script tag to production URL
```

## WebGL Transition Setup (Between Pages)

If you want images to fly between pages (e.g., homepage → project detail):

### Source page (e.g., Home):
```js
// In HomeView's createPlanes()
setupTransitionHandler(mesh, img) {
  const link = img.closest('[data-gl-container]')?.querySelector('a');
  link?.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 768px)').matches) return;
    emitter.emit('webgl:transition:prepare', {
      mesh,
      targetUrl: link.href,
      sourcePage: 'home',
    });
  }, { signal: this.abortController.signal });
}
```

### Destination page transition (e.g., ProjectTrans):
```js
// In the per-page transition's onEnter — synchronous pull, no events
const targetEl = to.querySelector('[data-gl-target]');
const ctx = this.transitionController?.getFlightContext(
  targetEl?.getBoundingClientRect(),
); // null → no flight staged; compose the DOM-only fallback

const tl = gsap.timeline({
  onComplete: () => { ctx?.cleanup(); animationComplete(); },
});
tl.to({}, { duration: FLIGHT }, 0);   // flight spine
tl.addLabel('handoff', '>-20%');      // WebGL → HTML image swap beat
if (ctx) {
  tl.to(ctx.mesh.position, { x: ctx.world.x, y: ctx.world.y, duration: FLIGHT, ease: 'expo.inOut' }, 0);
  tl.to(ctx.uniforms.uOpacity, { value: 0, duration: FLIGHT * 0.2 }, 'handoff');
}
// DOM reveals compose at the labels — see src/transitions/pages/ProjectTrans.js
```

## Pre-Launch Performance Checklist

Before deploying, verify:

- [ ] Pixel ratio capped at 2 (`src/canvas/index.js`)
- [ ] Delta capped at 60ms (`src/canvas/utils/Time.js`)
- [ ] Mobile guard at 768px for WebGL effects
- [ ] `gsap.ticker.lagSmoothing(100, 16)` set (`src/utils/smoothscroll.js`)
- [ ] All geometries/materials disposed on page leave
- [ ] AbortController.abort() called in DOMPlane destroy
- [ ] Components register cleanup via `onDestroy(...)` from `@core/hooks` (factory pattern)
- [ ] Textures through TextureCache (not direct TextureLoader)
- [ ] Image sizes appropriate (2048 max desktop, 1024 mobile)
- [ ] Production build has console.log stripped (terser config)
- [ ] Test on Safari, Firefox, Chrome, mobile Safari, Chrome Android

## Key Files to Modify

- `src/main.js` — Page registry, transition registry, preloader config
- `src/canvas/YourPage/index.js` — New page classes
- `src/components/index.js` — Component registration
- `src/animations/index.js` — Animation registration
- `src/transitions/pages/` — Custom page transitions
- `package.json` — Project name
- `vite.config.js` — Usually no changes needed
