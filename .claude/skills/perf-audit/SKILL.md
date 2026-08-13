---
name: perf-audit
description: Audit and fix performance issues to maintain 60fps. Use when diagnosing frame drops, janky scroll, hover lag, transition stutter, or any performance degradation.
user-invocable: true
---

# Performance Audit — 60fps Across All Browsers and Devices

## The Target

**60fps minimum = 16.67ms per frame budget.** Every frame must complete all JS, layout, paint, and compositing within this budget. On mobile, this is even tighter due to weaker GPUs and thermal throttling. Anything below 60fps on a desktop browser is a regression worth diagnosing.

## Measuring (start here)

The starter ships with `@utils/perf` — auto-starts via `_core/boot.js`, runs on the unified RAF, and tracks frame time end-to-end.

```js
import perf from '@utils/perf'

// Live overlay (also bound to Shift+F, persists in localStorage)
perf.toggleFpsDisplay()

// Programmatic snapshot
perf.getMetrics()
// → { fps, frameTime, min, max, smoothness, budget }
//   smoothness = 100 - (stddev/avg * 100)  — lower = janky
//   budget     = % of frames under 16.67ms — should stay near 100

// Web vitals (passive, FCP / LCP / CLS)
perf.getWebVitals()

// Opt-in tracking of frames > 50ms
perf.enableFrameDropDetection()
perf.getFrameDrops()  // [{ time, delta }] last 50

// Custom timing markers (e.g. Preloader → home ready)
perf.add('home:enter-ready')
perf.getMarks()
```

**Read the overlay first**, then use the checklist below to find the cause when fps drops below 60 or budget falls under ~95%.

## Quick Audit Checklist

Run through this list when diagnosing performance issues. Each item is ordered by likelihood of being the problem.

### 1. Pixel Ratio

**Check:** `src/canvas/index.js` renderer setup
```js
Math.min(window.devicePixelRatio, 2)
```
- Must be capped at 2. Never 3 or higher.
- 3x rendering = 2.25x more pixels than 2x. Mobile GPUs can't handle it.
- If someone removed the cap, restore it immediately.

### 2. Geometry Segment Count

**Check:** `src/canvas/DOMPlane.js` → `createPlane()`
- Default: `PlaneGeometry(w, h, 32, 32)` = 1,024 vertices per plane
- 10 planes = 10,240 vertices. Acceptable.
- 50 planes = 51,200 vertices. Consider reducing to 16x16 (256 per plane).
- If no vertex deformation needed: 1x1 is enough.
- TransitionController uses 64x64 during animation — this is temporary and acceptable.

### 3. Texture Sizes and Dedup

**Check:** `src/canvas/utils/TextureCache.js`
- Are textures being loaded through TextureCache? Direct `TextureLoader.load()` bypasses dedup.
- Image dimensions: 2048x2048 max for desktop, 1024x1024 for mobile.
- Use `texture.minFilter = THREE.LinearFilter` to avoid mipmap generation for UI textures.
- Count unique textures: each one uses GPU memory. 20+ unique large textures will cause memory pressure on mobile.

### 4. Unified RAF + Delta Cap

**Check:** `src/_core/raf.js` (single shared loop), `src/canvas/utils/Time.js` (delta clamp)

- All per-frame work runs through `addRaf(fn, priority)`. Lenis = priority 0, WebGL Time = priority 1, perf metrics = priority 10. Two competing RAF loops is a regression.
- `Time.js` still clamps `this.delta` at 60ms after tab-focus recovery — must be present, otherwise animations explode when returning to the tab.
- If you add a new long-running per-frame thing, register it via `addRaf` instead of starting another `requestAnimationFrame` loop.

### 5. getBoundingClientRect Cost

**Check:** `src/canvas/DOMPlane.js` → `updatePlanePosition()`
- Called every frame for every plane to sync with scroll.
- Each call forces layout recalculation if DOM has been modified.
- Under 20 planes: acceptable.
- Over 20 planes: consider caching rects and only updating on Lenis scroll events.
- **Never** call getBoundingClientRect inside a loop that also writes to the DOM.

### 6. Shader Complexity

**Check:** `src/canvas/shaders/defaultFrag.glsl`
- Count `texture2D()` calls. Default has 3 (chromatic aberration R/G/B). Max 4 per fragment.
- Check for loops. Never loop in fragment shaders.
- Check for `pow()`, `log()`, `exp()` — expensive on mobile GPUs. Use multiplication instead of `pow(x, 2.0)`.
- Check for branching (`if/else`). Use `step()`, `mix()`, `smoothstep()` instead.
- Precision: use `mediump float` unless you need `highp` for position math.

### 7. GSAP Lag Smoothing

**Check:** `src/utils/smoothscroll.js`
```js
gsap.ticker.lagSmoothing(0);
```
- Must be set. Without it, GSAP drops frames to catch up, causing visible stutters.

### 8. Resize Handler Throttling

**Check:** `src/_core/resize.js` (centralized) and any `window.addEventListener('resize', ...)` in source

- Resize is centralized: subscribe via `addResize(fn, priority)` from `@core/resize`. 100 ms debounce, same-size frames (mobile toolbar show/hide) filtered out, priority-ordered (Canvas runs at 0, DOMPlane / scroll-driven layout should run after).
- Adding a raw `window.addEventListener('resize', ...)` is a regression — replace with `addResize` and keep the unsubscribe handle for cleanup in `onDestroy`.

### 9. Mobile WebGL Guard

**Check:** Various locations
```js
if (window.matchMedia('(max-width: 768px)').matches) return;
```
- WebGL effects must be disabled under 768px.
- Check: TransitionController, HomeView hover handlers, transition handlers.
- If mobile users see WebGL content, this guard is missing.

### 10. Page Update Guard

**Check:** `src/canvas/Page.js` → `update()`
```js
if (!this.isActive) return;
```
- Canvas ticks ALL cached pages, not just the active one. This guard prevents work on hidden pages.
- If removing this guard, you're doing unnecessary work every frame.

### 11. Geometry/Material Disposal

**Check:** Page `destroy()`, DOMPlane `destroy()`, TransitionController `cleanup()`
- Every `new PlaneGeometry()` must have a matching `.dispose()`
- Every `new ShaderMaterial()` must have a matching `.dispose()`
- Check for geometry recreation on resize without disposing the old one.
- Three.js DevTools extension can show live GPU memory.

### 12. Event Listener Cleanup

**Check:** DOMPlane `this.abortController.abort()`, components using `onDestroy(...)` from `@core/hooks`

- DOMPlane uses an AbortController to remove all hover listeners at once on destroy.
- Components are factory functions discovered by `data-component`. Register cleanup with `onDestroy(() => off())` from `@core/hooks` — TransitionManager runs `runDestroy()` on every page leave, which fires those callbacks before the new page mounts.
- Leaked listeners = ghost events + GC pressure. Verify in DevTools → Memory: event listener count should not grow across page transitions.

## Draw Call Counting

Each mesh = 1 draw call. Check in browser:
```js
console.log(window.__canvas.renderer.info.render);
// { calls, triangles, points, lines, frame }
```

- Under 50 draw calls: fine
- 50–100: monitor closely
- Over 100: use InstancedMesh or merge geometries

## Chrome DevTools Profiling

### Performance Tab
1. Open DevTools → Performance
2. Click Record
3. Interact with the page (scroll, hover, navigate)
4. Stop recording
5. Look for:
   - **Red bars** at the top = dropped frames
   - **Long tasks** (yellow blocks > 16ms)
   - **Recalculate Style** (purple) = layout thrashing
   - **Paint** (green) = excessive repaints

### GPU Profiling
1. DevTools → Performance → check "GPU"
2. Look for GPU-bound frames (GPU bar extends beyond 16ms)
3. Common causes: too many texture samples, high resolution, complex shaders

### Memory Tab
1. DevTools → Memory → Heap Snapshot
2. Search for "Texture", "BufferGeometry", "ShaderMaterial"
3. Compare snapshots before and after navigation to find leaks

## Common Performance Fixes

### Frame drops on scroll
1. Check getBoundingClientRect call count
2. Check `ScrollTrigger.getAll().length` — should match the active page's animations only, not accumulate across navigations. If it's growing, `Animation.destroy()` isn't being called on transition.
3. Check Lenis → ScrollTrigger sync: `lenis.on('scroll', () => ScrollTrigger.update())`
4. Check `prefersReducedMotion()` — when true, `AnimationCore.setup()` early-returns; no scroll animations should be created at all.

### Frame drops on hover
1. Check lerp ease value (0.09 default — higher = more CPU per frame)
2. Check shader complexity in fragment shader
3. Check if hover listeners are leaking (AbortController not aborted)

### Frame drops during transition
1. Check TransitionController geometry rebuild (64x64 per frame is expected)
2. Check for overlapping transitions (previous not cleaned up)
3. Check GSAP timeline cleanup (`kill()` on old timelines)

### Janky text animations
1. Check SplitText element count (50+ chars = expensive stagger)
2. Use `autoAlpha` not `opacity` (enables `visibility: hidden` at 0)
3. Mobile: skip SplitText, use simple opacity fade

### High GPU memory
1. Count textures: `window.__canvas.renderer.info.memory`
2. Check TextureCache for orphaned textures
3. Cap texture sizes: 2048 desktop, 1024 mobile
4. Dispose textures when pages are destroyed

## Cross-Browser Performance Targets

| Platform | Target | Notes |
|----------|--------|-------|
| Chrome Desktop | 60fps | Baseline — if it drops here, something is wrong |
| Safari Desktop | 60fps | WebGL context limit (~16). Fewer draw calls. |
| Firefox Desktop | 60fps | Stricter GLSL. Slightly different RAF timing. |
| Chrome Android | 60fps | Cap pixel ratio at 2. Reduce segments. |
| Safari iOS | 60fps* | *May default to 30fps on older devices. Keep shaders simple. |
| Low-end Android | 30fps | Acceptable. Reduce everything: segments, textures, hover effects. |

### Safari-Specific
- WebGL context limit: ~16. Each canvas = 1 context. Dispose unused.
- Aggressive tab throttling: delta cap handles recovery.
- No SharedArrayBuffer: don't use worker-based rendering.
- `powerPreference: 'high-performance'` in renderer options can help.

### Mobile Safari
- Touch events: use `{ passive: true }` for scroll/touch listeners.
- `syncTouches: true` in Lenis helps with touch scroll momentum.
- Disable all hover effects (no mouse on touch devices).

### Firefox
- Stricter GLSL validation: always declare precision, no undeclared vars.
- Different RAF timing: use delta-based animation, never frame-count.

### Low-End Android (Mali/Adreno)
- Reduce geometry to 16x16 or 8x8 segments.
- Cap textures at 512x512.
- Skip chromatic aberration (3 texture samples → 1).
- Skip vertex deformation (simplify vertex shader).
- Consider skipping WebGL entirely below a performance threshold.

## Key Files

- `src/_core/raf.js` — Unified RAF, priority subscriptions
- `src/_core/resize.js` — Centralized debounced resize
- `src/_core/hooks.js` — Lifecycle hooks (onMount/onDestroy/onPageIn/onPageOut)
- `src/utils/perf.js` — FPS overlay, frame drops, web vitals
- `src/utils/media.js` — `prefersReducedMotion()`, `isMobile()`
- `src/canvas/index.js` — Renderer, pixel ratio, resize subscription
- `src/canvas/utils/Time.js` — Render clock (delta cap), driven by `@core/raf`
- `src/canvas/DOMPlane.js` — getBoundingClientRect, geometry
- `src/canvas/utils/TextureCache.js` — Texture memory + `publicAssetUrl` resolution
- `src/canvas/shaders/defaultFrag.glsl` — Fragment shader cost
- `src/canvas/shaders/defaultVert.glsl` — Vertex shader cost
- `src/utils/smoothscroll.js` — Lenis, lagSmoothing
- `src/canvas/TransitionController.js` — Transition geometry rebuild
- `src/animations/AnimationCore.js` — `setup()`/`activate()` split, no auto-cleanup
