---
name: debug
description: Diagnose and troubleshoot issues in the WebGL + Webflow system. Use when something is broken — shaders won't compile, pages don't detect, transitions break, textures don't load, animations don't fire, or events are lost.
user-invocable: true
---

# Debug — Diagnostic Troubleshooting Guide

## Quick Access

Debug escape hatch in browser console:
```js
window.__canvas  // Canvas instance — renderer, camera, scene, pages, time
window.__canvas.renderer.info  // draw calls, memory, textures
window.__canvas.currentPage  // active page instance
window.__canvas.pages  // all cached page instances
```

**Note:** `console.log` is stripped in production builds (terser config in `vite.config.js`). Debug only in dev mode (`bun run dev`).

## Symptom → Diagnosis

---

### "Shader won't compile"

**Console shows:** `THREE.WebGLProgram: Shader Error` with line numbers

**Check:**
1. **GLSL syntax** — Missing semicolons, wrong types, undeclared variables
2. **`#include` paths** — Relative to the including file. Check `src/canvas/utils/includes/` exists
3. **Uniform declarations** — Must match between JS (`mesh.material.uniforms.uName`) and GLSL (`uniform float uName`)
4. **Type mismatches** — `vec2` uniform but set as `float` in JS, or vice versa
5. **Precision** — Fragment shaders need `precision mediump float;` or it'll fail on some devices
6. **WebGL1 vs WebGL2** — This system uses WebGL1 syntax. Don't use `in`/`out`/`texture()`. Use `attribute`/`varying`/`texture2D()`.

**Quick fix:** Comment out shader effects one by one to isolate the failing line. Three.js prints the full compiled shader with line numbers.

---

### "Page not detected" / Wrong page loads

**Check:**
1. **`data-page` attribute** — Is it set on `<body>` or a visible element in Webflow? `document.querySelector('[data-page]')` should find it.
2. **Registry match** — Is the page registered in `src/main.js` `const pages = { ... }`? Key must match `data-page` value exactly (case-sensitive).
3. **URL fallback** — If no `data-page`, Canvas tries URL path matching. `/about` looks for `about` in registry. `/work/slug` tries `work`. `/` maps to `home` or `index`.
4. **Taxi view** — Is `data-taxi-view` present? Taxi needs this to identify the swappable content area.

**Debug:**
```js
// In console
document.querySelector('[data-page]')?.dataset.page
window.__canvas.detectPageName(document.querySelector('[data-taxi-view]'))
```

---

### "DOMPlane position is wrong" / Planes misaligned

**Check:**
1. **Viewport calculation** — `calculateViewport()` must run before creating planes. Check `this.viewport` and `this.screen` are populated.
2. **Camera position** — Default is `z = 1` with FOV 45. If camera was moved, viewport calculation breaks.
3. **getBoundingClientRect timing** — If called before images load, rects are 0x0. Wait for image `onload` or use TextureCache which waits for load.
4. **CSS transforms on parents** — `getBoundingClientRect()` returns transformed coordinates. If a parent has `transform: scale()`, plane positions will be offset.
5. **Scroll position** — `getBoundingClientRect()` is relative to viewport. If Lenis hasn't started, initial rects might be wrong.
6. **Canvas container CSS** — `.canvas` must be `position: fixed; top: 0; left: 0; width: 100%; height: 100%`.

**Debug:**
```js
// Check viewport
const page = window.__canvas.currentPage;
console.log('viewport:', page.viewport, 'screen:', page.screen);

// Check a plane's bounds vs DOM
const plane = page.view.imagePlanes[0];
const img = plane.userData.img;
console.log('DOM rect:', img.getBoundingClientRect());
console.log('Plane pos:', plane.position);
```

---

### "Transition breaks" / WebGL transition doesn't animate

**Check:**
1. **Event flow** — one event only: the source page emits `webgl:transition:prepare` `{ mesh, targetUrl, sourcePage }` on click; the controller stages the clone. The destination page transition must call `this.transitionController.getFlightContext(rect)` synchronously in `onEnter` — if it returns `null`, nothing was staged (no click / mobile / direct URL) and the DOM-only fallback should compose on the same timeline.
2. **Source mesh** — Is the clicked image's mesh valid? Check `mesh.material.uniforms` exist.
3. **Per-page transition registered?** — `getFlightContext` only gets called by a per-page class (e.g. `ProjectTrans`) registered in `main.js` `pageTransitions`; the default GlobalEnter never consumes a staged mesh (TransitionManager's finally-block cleans up the orphan).
4. **`[data-gl-target]` present** on the destination page? The rect passed to `getFlightContext` comes from it.
5. **Mobile guard** — the prepare listener bails on `isMobile()`. WebGL flights won't fire on mobile.
6. **Taxi navigation** — Is the link intercepted by Taxi? Check it's not `data-taxi-ignore` or external.

**Debug:**
```js
// Listen for all live transition events
import emitter from '@utils/Emitter';
['webgl:transition:prepare', 'home:intro-started',
 'transition:start', 'transition:complete', 'theme:change'].forEach(e => {
  emitter.on(e, (data) => console.log(e, data));
});
```

---

### "Textures not loading" / Black or missing images

**Check:**
1. **TextureCache** — Is `textureCache.load(src)` being called? Check the src URL is valid.
2. **CORS** — Cross-origin images need CORS headers. Webflow-hosted images are same-origin. External CDN images need `Access-Control-Allow-Origin`.
3. **Image src** — Check `img.src` vs `img.dataset.glSrc`. If `data-gl-src` is set, that's used instead.
4. **Preloader** — Preloader loads ALL `<img>` elements' textures. If an image is added dynamically after preload, it won't be cached.
5. **Texture format** — Three.js TextureLoader supports JPEG, PNG, WebP. Not AVIF, not SVG.

**Debug:**
```js
import textureCache from '@canvas/utils/TextureCache';
console.log('Cached textures:', [...textureCache.cache.keys()]);
console.log('Pending loads:', [...textureCache.pending.keys()]);
```

---

### "Scroll animations not firing"

**Check:**
1. **Data attribute** — Element must have a `data-anim="<value>"` attribute. Check spelling — `<value>` must match a key under `data-anim` in `REGISTRY` (`fade-in`, `line`, `image-reveal`, `image-parallax`, `heading`, `paragraph`, plus any custom additions).
2. **Animation manager** — Is the animation type registered in `src/animations/index.js`? Check the querySelector matches.
3. **ScrollTrigger trigger** — By default, the element itself is the trigger. If the element is `display: contents`, ScrollTrigger can't compute its bounds. HeadingReveal has a guard for this.
4. **Lenis sync** — ScrollTrigger must be synced with Lenis: `lenis.on('scroll', () => ScrollTrigger.update())`. Check `src/utils/smoothscroll.js`.
5. **triggerStart** — Default is `'top 90%'`. If the element is above the fold, it may have already passed. Check `markers: true` to visualize.
6. **Cleanup** — animations stay alive for the page lifetime; `Animation.destroy()` (called by TransitionManager on every Taxi `onLeave`) kills the timeline + ScrollTrigger. If a previously-fired one-shot doesn't replay on revisit, that's expected — the trigger has `once: true` and doesn't re-fire after the new instance mounts. Set `once: false` if you need it to re-trigger on every viewport entry.

**Debug:**
```js
// Check all active ScrollTriggers
ScrollTrigger.getAll().forEach(st => {
  console.log(st.trigger, st.start, st.end, st.isActive);
});
```

---

### "Events not received" / Emitter not working

**Check:**
1. **Import** — Two different exports:
   - `import { Emitter } from '@utils/Emitter'` — the class (for extending)
   - `import emitter from '@utils/Emitter'` — the singleton (for global events)
   - If you import the class and try to emit on it, nothing will hear it.
2. **Namespace cleanup** — `emitter.off('event', null, 'namespace')` removes by namespace. If a namespace was cleaned up, its listeners are gone.
3. **Listener order** — `emitter.on()` must be called before `emitter.emit()`. If the event fires before the listener attaches, it's missed. Use `setTimeout(0)` to defer emit (see Home page pattern).
4. **Event name typo** — Event names are strings. `'webgl:transition:prepare'` must match exactly.

**Debug:**
```js
// Monkey-patch to log all emitter events
const originalEmit = emitter.emit.bind(emitter);
emitter.emit = (event, data) => {
  console.log(`[Emitter] ${event}`, data);
  return originalEmit(event, data);
};
```

---

### "Memory leak" / Performance degrades over time

**Check:**
1. **Geometry disposal** — `Page.destroy()` traverses `this.elements` and disposes. But if you create geometry outside the group, you must dispose manually.
2. **Material disposal** — Same as above. Check `ShaderMaterial` instances are disposed.
3. **Texture disposal** — `textureCache.clear()` disposes all. Call when appropriate (e.g., page with completely different textures).
4. **AbortController** — DOMPlane uses `this.abortController.abort()` to remove all listeners. If not called, listeners accumulate.
5. **GSAP timelines** — Kill orphaned timelines: `gsap.killTweensOf(target)`.
6. **ScrollTrigger** — `Animation.destroy()` calls each instance's `destroy()` on every Taxi `onLeave`, which kills both timeline + scrollTrigger. If you bypass the Animation manager and create ScrollTriggers manually, kill them yourself in your component's `onDestroy(() => st.kill())`.
7. **Page caching** — Canvas caches page instances in `this.pages`. This is intentional (don't re-create on revisit). But if pages hold large arrays or textures, memory grows with each unique page visited.

**Debug:**
```js
// Check Three.js memory
console.log(window.__canvas.renderer.info.memory);
// { geometries, textures }

// Check renderer stats
console.log(window.__canvas.renderer.info.render);
// { calls, triangles, points, lines, frame }
```

---

### Performance-Specific Symptoms

**Janky scroll:**
→ Check getBoundingClientRect call count, ScrollTrigger count, Lenis sync

**Hover lag:**
→ Check shader complexity, lerp ease value, leaked hover listeners

**Transition stutter:**
→ Check geometry rebuild (64x64 expected), overlapping transitions, timeline cleanup

**Slow initial load:**
→ Check texture count and sizes, Preloader progress, readySignal timing

See `/perf-audit` skill for comprehensive performance diagnosis.

## Key Files

- `src/canvas/index.js` — Canvas manager, `window.__canvas`
- `src/canvas/Page.js` — Page lifecycle
- `src/canvas/DOMPlane.js` — DOM-to-WebGL mapping
- `src/canvas/TransitionController.js` — WebGL transitions
- `src/canvas/utils/TextureCache.js` — Texture loading
- `src/utils/Emitter.js` — Event system (class + singleton)
- `src/animations/index.js` — Animation manager
- `src/transitions/index.js` — TransitionManager (Taxi wrapper)
- `vite.config.js` — Build config (terser strips console.log)
