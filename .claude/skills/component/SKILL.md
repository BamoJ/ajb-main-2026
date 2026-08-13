---
name: component
description: Build DOM components with proper Taxi.js lifecycle management. Use when creating UI elements like menus, cursor followers, theme toggles, modals, or any interactive DOM component.
user-invocable: true
---

# Component — Auto-Discovered DOM Components

## What It Is

A component is a **default-exported factory function** at `src/components/<anywhere>/<name>.js`. It's auto-mounted by `discoverComponents()` on every element with `data-component="<name>"`. The factory receives `(element, dataset)` and registers cleanup via `onDestroy(...)` from `@core/hooks`.

There is no base class to extend. There is no manual registry to edit. Drop a file → drop an attribute → done.

The previous `ComponentCore extends`/`removeEventListeners()` pattern is gone.

## Minimal Example

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

That's a complete component. The factory runs at discovery; `onDestroy` fires on every Taxi `onLeave` and is drained before the next page mounts.

## Discovery Rules

- File location: `src/components/<anywhere>/<name>.js` (any nesting under `components/`).
- Discovery glob: `'./!(index|discover|_core)/**/*.js'` (Vite's `import.meta.glob`, eager).
- Component name = filename, lowercased (`MainNav.js` → `mainnav`).
- Default export must be a function. Non-function default exports are skipped (with a warning).
- `data-component` value matches the lowercased filename. Mismatched names log `[components] No module for [data-component="x"]`.
- Each element gets a `_componentInitialized` flag so re-discovery on the same DOM is a no-op.
- Nested components work — both the outer `<div data-component="menu">` and an inner `<button data-component="button">` are discovered independently. The factory for the outer one shouldn't manually call `discoverComponents()` on its subtree; the top-level pass handles everything.

## Lifecycle Hooks (`@core/hooks`)

The runtime contract for every component, animation, and transition:

```js
import { onMount, onDestroy, onPageIn, onPageOut } from '@core/hooks';

onMount(() => { /* sync setup, after DOM is in place */ })
onDestroy(() => { /* sync teardown — listeners, timers, refs */ })
onPageIn(async () => { /* async, awaited; activate scroll-driven things */ })
onPageOut(async () => { /* async, awaited; element-aware exit anims */ })
```

`onPageOut(fn, { element })` only runs `fn` if `element` is currently in viewport — saves frames during transitions when the user is far below an off-screen element. TransitionManager drains each queue at the right moment; you never call `runX()` yourself in a component.

## Stateful Pattern (factory wraps a class)

When state grows beyond a handful of refs, wrap a class in the factory:

```js
// src/components/menu/menu.js
import { onDestroy } from '@core/hooks';

class Menu {
  constructor(el) {
    this.el = el;
    this.open = el.querySelector('[data-menu="open"]');
    this._toggle = this._toggle.bind(this);
    this.open.addEventListener('click', this._toggle);
  }
  _toggle() { this.el.classList.toggle('is-open'); }
  destroy() { this.open.removeEventListener('click', this._toggle); }
}

export default function (el) {
  const menu = new Menu(el);
  onDestroy(() => menu.destroy());
}
```

## Common Patterns

### Hover with AbortController

```js
import { onDestroy } from '@core/hooks';

export default function hoverable(el) {
  const controller = new AbortController();
  el.addEventListener('mouseenter', () => el.classList.add('is-hover'), { signal: controller.signal });
  el.addEventListener('mouseleave', () => el.classList.remove('is-hover'), { signal: controller.signal });
  onDestroy(() => controller.abort());  // removes both listeners at once
}
```

### Viewport visibility (`onView` from `@core/observe`)

```js
import { onView } from '@core/observe';

export default function reveal(el) {
  onView(el, {
    once: true,
    callback: ({ isIn }) => {
      if (isIn) el.classList.add('is-revealed');
    },
  });
  // onView auto-cleans via onDestroy under the hood
}
```

### Scroll progress 0–1 (`onTrack` from `@core/track`)

```js
import { onTrack } from '@core/track';

export default function parallax(el) {
  onTrack(el, {
    callback: (t) => el.style.setProperty('--p', t),
  });
}
```

`onTrack` returns a 0–1 value as the element passes through the viewport (using Lenis scroll if present, falls back to `window`). Auto-cleans via `onDestroy`.

### Cross-component events (singleton `Emitter`)

```js
import emitter from '@utils/Emitter';
import { onDestroy } from '@core/hooks';

export default function menu(el) {
  const close = () => el.classList.remove('is-open');
  emitter.on('transition:start', close, 'menu');  // 'menu' is a namespace
  onDestroy(() => emitter.off('transition:start', null, 'menu'));
}
```

The namespace lets you `emitter.off(event, null, 'menu')` to drop everything in that namespace at once.

## Mobile Guard

```js
import { isMobile } from '@utils/media';

export default function cursor(el) {
  if (isMobile()) return;  // no cursor follower on touch devices
  // ...
}
```

`prefersReducedMotion()` is also available from `@utils/media` for accessibility-aware components.

## Webflow Integration

- HTML lives in Webflow; this bundle is the JS/WebGL layer. Set `data-component="menu"` directly on the relevant Webflow element.
- After every Taxi page swap, `resetWebflow()` runs `window.Webflow.forEach(wf => { wf.destroy(); wf.ready() })` so Webflow native JS (forms, tabs, sliders, IX2) re-inits on the new DOM. Your factory then runs against that re-inited DOM.
- For elements where you use Webflow Interactions, add `data-taxi-ignore` on the link to prevent SPA navigation from clobbering it.

## 60fps Rules

1. **Always register cleanup** — every listener/timer/RAF you start, register an `onDestroy(...)` to tear it down. TransitionManager drains the destroy queue on every page leave; leftover listeners accumulate fast.
2. **Use `gsap.ticker` or `addRaf` for RAF loops** — don't roll your own `requestAnimationFrame`. `gsap.ticker.add(fn)` syncs with GSAP's render pipeline. For non-GSAP needs, `addRaf(fn, priority)` from `@core/raf` joins the unified loop.
3. **`gsap.set()` over direct style manipulation** — uses transforms (GPU-composited) instead of triggering layout.
4. **Lerp for smooth motion** — for cursor followers etc., use lerp with a 0.08–0.12 ease factor.
5. **Passive listeners** — `{ passive: true }` for scroll/touch listeners that don't `preventDefault()`.
6. **Guard null elements** — always check `if (!queryResult) return` before binding.

## Cross-Browser

- **Safari**: `pointer-events` on transformed elements can behave differently. Test hover states.
- **Mobile**: skip cursor-following components via `isMobile()`. Use touch-specific UX where applicable.
- **Firefox**: `transform: translate3d()` forces a GPU layer. Use `will-change: transform` sparingly — too many composite layers hurt perf.

## Key Files

- `src/components/discover.js` — `import.meta.glob` + factory dispatch + `_componentInitialized` flag
- `src/components/index.js` — thin `Components` wrapper around discover/destroy
- `src/_core/hooks.js` — `onMount` / `onDestroy` / `onPageIn` / `onPageOut`
- `src/_core/observe.js` — `onView()` (pooled IntersectionObserver)
- `src/_core/track.js` — `onTrack()` (scroll-progress)
- `src/_core/raf.js` — `addRaf(fn, priority)` for shared RAF loop
- `src/utils/Emitter.js` — singleton emitter for cross-component events
- `src/utils/media.js` — `isMobile()`, `prefersReducedMotion()`
- `src/transitions/index.js` — TransitionManager (calls `runDestroy` / `runMount` per nav)
