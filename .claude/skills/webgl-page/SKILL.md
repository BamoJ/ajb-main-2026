---
name: webgl-page
description: Build new WebGL page subclasses. Use when creating a new page with Three.js visuals, setting up the page lifecycle, or registering a page in the canvas system.
user-invocable: true
---

# WebGL Page — Build a New Page Subclass

## Architecture

Every WebGL page extends `Page` (`src/canvas/Page.js`) which extends `Emitter`. The Canvas manager (`src/canvas/index.js`) owns the renderer, camera, scene, and lifecycle. Pages are registered in `src/main.js` and detected via `data-page` attribute or URL path.

## Page Lifecycle

```
load() → create() → onEnter() → update(time) [per frame] → onLeave() → destroy()
```

- **`load()`** — async, preload assets (textures, models) before create. Called once.
- **`create(template)`** — setup meshes, materials, geometry. Guarded by `if (this.created) return`. Adds `this.elements` (THREE.Group) to scene. Emits `'create'`.
- **`onEnter(data)`** — makes `this.elements` visible, sets `isActive = true`, calls `transitionIn()`, emits `'enter'`.
- **`update(time)`** — called every frame. **Must guard:** `if (!this.isActive) return`. Receives Time instance with `time.delta` (ms since last frame, capped at 60ms).
- **`onLeave(data)`** — calls `transitionOut()` which hides elements and sets `isActive = false`. Emits `'leave'`.
- **`destroy()`** — traverses `this.elements` group, disposes all geometries and materials (handles array materials), removes from scene.

## Creating a New Page

### 1. Create the page file

```
src/canvas/YourPage/index.js
```

```js
import { Page } from '../Page';

export class YourPage extends Page {
  calculateViewport() {
    this.screen = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const fov = this.camera.fov * (Math.PI / 180);
    const viewportHeight = 2 * Math.tan(fov / 2) * this.camera.position.z;
    const viewportWidth = viewportHeight * this.camera.aspect;
    this.viewport = { width: viewportWidth, height: viewportHeight };
  }

  create(template) {
    super.create(template);
    this.calculateViewport();
    // Setup your WebGL objects here
    // Add meshes to this.elements (THREE.Group)
  }

  onEnter(data) {
    super.onEnter(data);
    // Page-specific enter logic
  }

  transitionIn(onComplete) {
    // GSAP animation, then call onComplete()
    onComplete?.();
  }

  transitionOut(onComplete) {
    // GSAP animation, then call onComplete()
    onComplete?.();
  }

  update(time) {
    if (!this.isActive) return;
    const { delta } = time;
    // Per-frame logic here
  }

  onResize() {
    this.calculateViewport();
    // Update meshes for new dimensions
  }
}
```

### 2. Register in main.js

```js
// src/main.js
import { YourPage } from '@canvas/YourPage';

const pages = {
  home: Home,
  yourpage: YourPage,  // key matches data-page="yourpage" or URL /yourpage
};
```

### 3. Set Webflow data attribute

On the page's body or wrapper element in Webflow:
```html
<body data-page="yourpage">
```

Or the page will be detected by URL path matching against registry keys.

## Scene Management

- Every page gets: `this.scene`, `this.camera`, `this.renderer`, `this.time`
- `this.elements = new THREE.Group()` — add all page meshes here, not directly to scene
- Group visibility is toggled automatically on enter/leave
- Pages are **cached** in Canvas — once created, they persist across navigations. `onEnter`/`onLeave` handle activation, not re-creation.
- Exception: if you need fresh state on re-visit, destroy and re-create the view in `onEnter` (see Home page pattern in `src/canvas/Home/index.js`)

## Viewport Calculation (FOV-Based)

This converts pixel dimensions to WebGL world units:

```
fov = camera.fov * (π / 180)
viewportHeight = 2 * tan(fov / 2) * camera.position.z
viewportWidth = viewportHeight * camera.aspect
```

Camera defaults: `PerspectiveCamera(45, aspect, 0.1, 100)` at `z = 1`.

## Emitting Ready Signals

If the Preloader waits for your page (via `readySignal` in main.js), emit the signal after your page is ready:

```js
create(template) {
  super.create(template);
  // ... setup ...
  setTimeout(() => {
    emitter.emit('yourpage:enter-ready');
  }, 0);
}
```

The `setTimeout(0)` ensures listeners have attached before the event fires.

## 60fps Rules

1. **Always guard update()** — `if (!this.isActive) return` prevents work on hidden pages. The Canvas ticks ALL cached pages, not just the active one.
2. **Delta capping** — Time.js caps `delta` at 60ms. Use `time.delta` for physics/animation, never raw timestamps. This prevents animation explosions after tab re-focus.
3. **Pixel ratio** — Renderer caps at `Math.min(window.devicePixelRatio, 2)`. Never override this. 3x rendering kills mobile GPUs.
4. **Mobile guard** — WebGL effects disabled under 768px. Use `isMobile()` from `@utils/media` (or `prefersReducedMotion()` for accessibility) before creating expensive effects.
5. **Lazy creation** — Pages are only created when first visited. Don't preload heavy assets for pages the user may never see.
6. **Dispose everything** — `destroy()` in Page.js handles group traversal, but if you create resources outside `this.elements`, dispose them manually.
7. **Geometry segments** — Default is 32x32 for DOMPlane. Only increase if you need vertex deformation. 16x16 is often enough for simple planes.
8. **Limit draw calls** — Each mesh = 1 draw call. For many similar objects, consider InstancedMesh or merging geometries.

## Cross-Browser

- **Safari**: WebGL context limit (~16 contexts). Dispose unused contexts. Safari aggressively throttles background tabs — delta cap handles this.
- **Firefox**: Slightly different RAF timing. Delta-based animation (not frame-count) handles this automatically.
- **Mobile Safari**: May default to 30fps on older devices. Keep shader complexity low. Use `{ powerPreference: 'high-performance' }` in renderer if needed.
- **Low-end Android**: Reduce geometry segments to 16x16 or 8x8. Skip hover effects. Cap textures at 1024x1024.

## Reference Implementation

See `src/canvas/Home/index.js` — a complete page using DOMPlane for image-to-WebGL mapping with hover effects and transition support.

## Key Files

- `src/canvas/Page.js` — Base class
- `src/canvas/index.js` — Canvas manager (renderer, camera, lifecycle)
- `src/canvas/utils/Time.js` — Render clock; driven by `@core/raf` (priority 1)
- `src/_core/raf.js` — Unified RAF loop (Lenis=0, Time=1, perf=10)
- `src/_core/resize.js` — Centralized debounced resize subscriptions
- `src/utils/media.js` — `isMobile()`, `prefersReducedMotion()`
- `src/main.js` — Page registry
