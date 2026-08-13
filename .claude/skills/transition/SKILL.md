---
name: transition
description: Build page transitions with Taxi.js routing, Lenis smooth scroll, and WebGL TransitionController. Use when creating page-to-page navigation, cross-page WebGL mesh animations, or custom transition effects.
user-invocable: true
---

# Transition — Page Routing + WebGL Transitions

## Architecture Overview

Three systems work together:
1. **Taxi.js** (`@unseenco/taxi`) — SPA-style page routing, fetches new pages, swaps DOM
2. **TransitionManager** (`src/transitions/index.js`) — Wraps Taxi with shared lifecycle (scroll, canvas, components, animations, theme, nav)
3. **TransitionController** (`src/canvas/TransitionController.js`) — stages a cloned mesh for cross-page flights; the per-page transition authors the flight on its own timeline

Lenis (`src/utils/smoothscroll.js`) handles smooth scroll and pauses during transitions.

## TransitionManager — The Orchestrator

`src/transitions/index.js`

**Boot order (do NOT change):** Taxi inits BEFORE `Components`/`Animation`. Taxi's Core constructor snapshots the entry page into its cache; if SplitText-splitting code ran first, the split markup gets cached and every SPA return re-splits it → nested masks. After boot, `pageTransitions[detectPageName()]?.initialEnter?.(view)` gives the current page's transition class one shot at hard-load choreography (Taxi transitions never run on a direct load).

### onLeave (before navigation):
1. `scroll.stopScroll()` — pauses Lenis
2. `emitter.emit('transition:start')` — global signal
3. `await runPageOut()` → `runDestroy()` — hook teardown

### onEnter (after new page loads):
1. Adds `.is-transition` to the new view (positions it `fixed` for cross-fade)
2. Assigns `this.transitionController` so the page transition can pull a flight context
3. Runs the page transition; on its completion callback:
   - sweeps ALL `[data-taxi-view]` except `to` from the live DOM (never a cached ref)
   - `window.scrollTo(0, 0)` + `scroll.resize()` (recalc Lenis extent)
   - yields one frame (`await new Promise(requestAnimationFrame)`) so the fade's last frames paint before the re-init burst
   - `resetWebflow()` → re-creates `Components`/`Animation` → `activate()` → `startScroll()` → `await runPageIn()` → `emitter.emit('transition:complete')`
4. After the transition starts, stashes the clicked `<a>` on `canvas.currentPage.leaveTrigger` and calls `canvas.onChange(pageName, to)` — unconditionally, so leaving to a non-WebGL page still runs the current page's `onLeave`

### Taxi options

```js
new Core({
  links: 'a:not([target]):not([href^=\\#]):not([data-taxi-ignore])',
  removeOldContent: false,   // old DOM stays for the cross-fade; we sweep it
  reloadCssFilter: false,    // NEVER merge incoming <head> CSS — Webflow's CDN
                             // can serve stale hashed builds of shared CSS and
                             // Taxi would append the old stylesheet to <body>
  transitions: { default: this.createRoute() },
});
```

`NAVIGATE_IN` hook: `switchThemeFromEntry(to)` (u-theme-* carry-over, `@utils/theme`) + `updateActiveNav()` (`@utils/nav`).

### Page Detection + Dispatch

`detectPageName(pageElement)` checks `data-page` / `data-canvas-page` / descendant `[data-page]`, then exact URL path-segment matching against the canvas registry (`/` maps to `home`/`index`). Per-page transition dispatch uses this same detector — never substring path matching.

## Default Transition (GlobalEnter)

`src/transitions/global/GlobalEnter.js` — crossfade on one timeline. The incoming view fades in (delay `IN_DELAY`), outgoing view(s) — read from the live DOM — fade out. `finish` is gated on BOTH fades (pending counter) so the sweep never removes a view mid-fade. Reduced motion snaps states. The safety backstop is derived from the actual pacing (`(inDelay + inDuration) * 1000 + 500`), so it can never beat the real fade.

Per-page subclasses may:
- set `inDelay` / `inDuration` / `outDelay` / `outDuration` instance fields
- override `composeEnter(to, tl)` to add hero reveals to the live timeline (must NOT be named `enter`/`leave` — Taxi's Transition base owns those)
- define `static initialEnter(view)` for hard-load choreography

## Creating a Page-Specific Transition

```js
// src/transitions/pages/YourPageTransition.js
import { Transition } from '@unseenco/taxi';

export default class YourPageTransition extends Transition {
  static initialEnter(view) { /* hard-load enter (optional) */ }

  onLeave({ from, trigger, done }) { done(); }

  // NOTE the non-standard signature: TransitionManager passes the completion
  // callback as the SECOND argument, not inside the object.
  onEnter({ to, trigger }, animationComplete) {
    const tl = gsap.timeline({ onComplete: animationComplete });
    // ... one timeline: WebGL handles + DOM tweens together
  }
}
```

Register in `main.js`: `const pageTransitions = { yourpage: YourPageTransition }`.

## WebGL Mesh Flight (TransitionController)

`src/canvas/TransitionController.js` — a pull-based staging API. It has **no `animate()` method and emits no events**; the per-page transition owns the entire flight timeline.

### Flow

```
1. User clicks a [data-gl-container] link on the source page
   └── source page emits 'webgl:transition:prepare' { mesh, targetUrl, sourcePage }
       └── controller clones the mesh (geometry AND material, uniforms by
           value), adds it to the scene, hides the source plane, resets
           interaction uniforms (uOffset, uMouseVelocity, uReveal,
           uPageTransition)

2. Taxi navigates; the destination transition's onEnter runs
   └── const ctx = this.transitionController.getFlightContext(
         to.querySelector('[data-gl-target]').getBoundingClientRect())
   └── ctx = { mesh, uniforms, sizeProxy, onSizeUpdate, world, cleanup }
       — raw GSAP-tweenable handles. ctx === null when nothing was staged
       (direct URL, mobile, no click) → compose the DOM-only fallback.

3. The transition composes everything on ONE timeline (see ProjectTrans.js)
   └── onComplete: ctx.cleanup() (remove mesh, dispose, restore source plane)
   └── TransitionManager's finally-block calls cleanup() again as an
       orphan-mesh safety net (no-op when already cleaned).
```

### Position grammar (GSAP-native)

```js
const FLIGHT = 1.5;
tl.to({}, { duration: FLIGHT }, 0);   // flight spine — exists with or without a mesh
tl.addLabel('reveal', '<35%');        //  35% into the flight
tl.addLabel('detail', '<45%');        //  45% into the flight
tl.addLabel('handoff', '>-20%');      //  last 20% — fade uOpacity → HTML image

if (ctx) {
  tl.to(ctx.mesh.position, { x: ctx.world.x, y: ctx.world.y, duration: FLIGHT, ease: 'expo.inOut' }, 0);
  tl.to(ctx.sizeProxy, { width: ctx.world.width, height: ctx.world.height, progress: 1,
        duration: FLIGHT, ease: 'expo.inOut', onUpdate: ctx.onSizeUpdate }, 0);
  tl.to(ctx.uniforms.uPageTransition, { value: 1, duration: FLIGHT, ease: 'power1.inOut' }, 0);
  tl.to(ctx.uniforms.uOpacity, { value: 0, duration: FLIGHT * 0.2 }, 'handoff');
}
tl.from(chars, { yPercent: 100, duration: 1.32, stagger: 0.05 }, 'reveal');
```

The percent labels must be added immediately after the spine tween — GSAP's `'<35%'`/`'>-20%'` forms are percentages **of the previous tween**. TRAP: a bare `'35%'` position is NOT a percentage; GSAP creates a label literally named "35%" at the timeline's current end.

### Composer signal for page enters (no flight)

A WebGL page's `transitionIn` emits `<page>:intro-started` with `{ timeline, ...handles }` — raw uniform objects (`{ value }`) that GSAP tweens directly. The per-page transition composes reveals onto the live timeline; if nobody composes, the empty timeline completes immediately. See `Home.transitionIn` (`home:intro-started` with `reveals`).

### UV Correction (`_correctUVs`)

During size transitions, `object-fit: cover` semantics are maintained: ideal UV scale/offset from `img.naturalWidth/Height` vs plane aspect, interpolated by `sizeProxy.progress`, with `shaderZoom` compensation (0.9 — must match the fragment shader's `scaleUV(vUv, 0.9)` and `userData.shaderZoom`).

## Lenis Smooth Scroll Integration

`src/utils/smoothscroll.js` — singleton. Config: `duration: 1.4`, exponential ease-out, `wheelMultiplier: 1.6`, `syncTouches: true`, `anchors: true`.

```js
lenis.on('scroll', () => ScrollTrigger.update());
gsap.ticker.lagSmoothing(100, 16);
```

During transitions: `stopScroll()` on leave; after the swap `window.scrollTo(0,0)` + `scroll.resize()` + `startScroll()`.

## CSS: `.is-transition`

`src/styles/base.css` — applied to the incoming view during transition (`position: fixed; inset 0; z-index: 10`) so old and new overlap. Removed on completion.

## 60fps Rules

1. **Geometry AND material are cloned** for the flight mesh — cleanup disposes them, so nothing may be shared with the live source plane.
2. **Timeline cleanup** — always `kill()` custom GSAP timelines in cleanup. Orphaned tweens accumulate and cause frame drops.
3. **Avoid overlapping transitions** — `prepare()` cleans up any previously staged mesh before staging a new one.
4. **Mobile skip** — the controller's prepare listener bails on `isMobile()`. Respect this pattern.
5. **64x64 segments during animation** — `onSizeUpdate` rebuilds PlaneGeometry every frame for smooth UV correction. Expensive but transition-only. Don't increase.
6. **UV correction is per-frame** during the size tween (GPU re-upload). Acceptable for the flight duration; never use in steady-state rendering.

## Cross-Browser

- **Safari**: aggressive tab throttling can stall transitions when the tab loses focus. Delta capping in Time.js handles recovery.
- **Mobile Safari**: touch momentum can fight Lenis; `syncTouches: true` helps, `stopScroll()` during transitions is essential.
- **Firefox**: different RAF timing — GSAP timelines are time-based, so durations stay correct.

## Key Files

- `src/transitions/index.js` — TransitionManager (Taxi wrapper)
- `src/transitions/Preloader.js` — Loading screen (headless-capable: `onProgress`, optional wrapper)
- `src/transitions/global/GlobalEnter.js` — Default crossfade
- `src/transitions/pages/ProjectTrans.js` — Flight reference implementation
- `src/canvas/TransitionController.js` — Mesh staging + flight context
- `src/utils/theme.js`, `src/utils/nav.js` — theme carry-over + active nav
- `src/utils/smoothscroll.js` — Lenis singleton
- `src/styles/base.css` — `.is-transition`
- `src/main.js` — Transition registry
