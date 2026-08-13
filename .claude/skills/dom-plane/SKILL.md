---
name: dom-plane
description: Map DOM elements to WebGL planes using DOMPlane. Use when overlaying Three.js planes on images, videos, or any DOM element with hover effects and scroll sync.
user-invocable: true
---

# DOMPlane — DOM-to-WebGL Plane Mapping

## What It Does

DOMPlane (`src/canvas/DOMPlane.js`) is the core pattern for "WebGL over DOM." It creates Three.js PlaneGeometry meshes sized and positioned to exactly overlay DOM elements (images, videos, divs). Planes sync position every frame for scroll, and include a full hover system with velocity tracking.

## Constructor

```js
const view = new YourView({
  parent: this.elements,       // THREE.Group from Page
  camera: this.camera,
  viewport: this.viewport,     // { width, height } in world units
  screen: this.screen,         // { width, height } in pixels
  shaders: {
    vertex: vertexShader,      // GLSL source string
    fragment: fragmentShader,  // GLSL source string
  },
});
```

Your view class extends DOMPlane. See `src/canvas/Home/index.js` (HomeView) as the reference.

## Creating Planes

### 1. Load textures

```js
import textureCache from '@canvas/utils/TextureCache';

async loadImages() {
  const imgElements = document.querySelectorAll('[data-gl="img"]');
  const uniqueSrcs = new Map();

  imgElements.forEach(img => {
    const src = img.dataset.glSrc || img.src;
    if (!uniqueSrcs.has(src)) uniqueSrcs.set(src, src);
  });

  const textures = {};
  await Promise.all(
    [...uniqueSrcs.entries()].map(async ([src]) => {
      textures[src] = await textureCache.load(src);
    })
  );

  this.createPlanes(imgElements, textures);
}
```

### 2. Create plane meshes

```js
createPlanes(imgElements, textures) {
  this.imagePlanes = [];

  imgElements.forEach((img, index) => {
    const src = img.dataset.glSrc || img.src;
    const texture = textures[src];
    const mesh = this.createPlane(texture, img, index);

    // Add custom uniforms if needed
    mesh.material.uniforms.uReveal = { value: 0 };
    mesh.material.uniforms.uWaveIntensity = { value: 0 };

    this.imagePlanes.push(mesh);
    this.imageGroup.add(mesh);

    // Setup hover listeners
    this.setupHoverListeners(mesh, img, '[data-gl-container]');

    // Hide DOM image (WebGL replaces it)
    img.style.opacity = '0';
  });

  this.updatePlanesPositions();
}
```

### 3. `createPlane(texture, el, index)` internals

DOMPlane.createPlane does:
1. Gets `el.getBoundingClientRect()`
2. Converts px → world units: `width = (bounds.width / screen.width) * viewport.width`
3. Creates `PlaneGeometry(width, height, 32, 32)` — 32 segments for vertex deformation
4. Creates `ShaderMaterial` with default uniforms:
   - `uTime` (float) — accumulated time
   - `uTexture` (sampler2D) — the image texture
   - `uOpacity` (float, default 1.0) — alpha control
   - `uOffset` (vec2) — mouse velocity displacement
   - `uMouseVelocity` (vec2) — normalized velocity for shader effects
   - `uReveal` (float) — reveal animation progress
5. Returns mesh (you must add to `this.imageGroup` yourself)

## World Coordinate Conversion

The FOV-based formula that converts DOM pixels to WebGL world coordinates:

```
worldX = ((domLeft + domWidth/2) / screenWidth) * viewportWidth - viewportWidth/2
worldY = viewportHeight/2 - ((domTop + domHeight/2) / screenHeight) * viewportHeight
planeWidth = (domWidth / screenWidth) * viewportWidth
planeHeight = (domHeight / screenHeight) * viewportHeight
```

This runs every frame in `updatePlanePosition()` to keep planes aligned during scroll.

## Hover System

### Setup

```js
this.setupHoverListeners(mesh, imgElement, '[data-gl-container]');
```

Finds `imgElement.closest(containerSelector)` and attaches:
- `mouseenter` → calls `this.onHoverEnter(mesh)`
- `mouseleave` → calls `this.onHoverLeave(mesh)`
- `mousemove` → updates `mesh.userData.targetMouseUV` (normalized -1 to 1) and `mesh.userData.targetWorldPos`

All listeners use `signal: this.abortController.signal` for clean teardown.

### Override hover callbacks

```js
onHoverEnter(mesh) {
  gsap.to(mesh.material.uniforms.uWaveIntensity, {
    value: 0.5,
    duration: 0.4,
    ease: 'power2.out',
  });
}

onHoverLeave(mesh) {
  gsap.to(mesh.material.uniforms.uWaveIntensity, {
    value: 0,
    duration: 0.2,
    ease: 'power2.out',
  });
}
```

### Per-frame hover update

`updateHoveredPlanes(delta)` runs every frame and:
- Increments `uTime` by `delta * 0.001`
- When hovered: lerps world position toward mouse at `ease = 0.09`, calculates velocity, writes `uOffset` (x * 0.2, y * 0.3) and `uMouseVelocity` (normalized to viewport)
- When not hovered: zeros out `uOffset` and `uMouseVelocity`

## Per-Frame Update

```js
update(time) {
  this.updatePlanesPositions();     // re-reads getBoundingClientRect for scroll sync
  this.updateHoveredPlanes(time.delta);  // hover lerp + velocity
}
```

## Resize Handling

```js
onResize(viewport, screen) {
  // DOMPlane.onResize updates internal refs and rebuilds geometry
  super.onResize(viewport, screen);
  // Disposes old geometry, creates new PlaneGeometry with updated dimensions
}
```

## Transition Handler Pattern

To support WebGL transitions between pages (e.g., clicking an image that flies to the detail page):

```js
setupTransitionHandler(mesh, img) {
  const container = img.closest('[data-gl-container]');
  const link = container?.querySelector('a[href]');
  if (!link) return;

  link.addEventListener('click', (e) => {
    if (isMobile()) return;
    emitter.emit('webgl:transition:prepare', {
      mesh,
      targetUrl: link.href,
      sourcePage: 'home',
      startPosition: null,
    });
  }, { signal: this.abortController.signal });
}
```

`webgl:transition:prepare` is the ONLY event in the flight system — the controller stages the cloned mesh and waits. The destination page's transition class then pulls the handle synchronously with `transitionController.getFlightContext(rect)` and authors the whole flight (mesh, uniforms, DOM) on its own timeline — see `/transition` skill and `src/transitions/pages/ProjectTrans.js`.

## Cleanup

```js
destroy() {
  this.abortController.abort();  // removes ALL hover listeners at once
  // DOMPlane.destroy() disposes geometries, materials, removes imageGroup from parent
  super.destroy();
}
```

## 60fps Rules

1. **getBoundingClientRect every frame** — This is the main cost. It forces layout recalculation. Acceptable for <20 planes. For 50+ planes, consider caching rects and only updating on scroll events. The `clientRect(el)` helper from `@utils/client-rect` returns an enriched rect (`top`, `bottom`, `width`, `height`, `wh`, `ww`, `offset`, `centerx`, `centery`) and is what DOMPlane uses internally.
2. **Geometry segments** — Default 32x32 = 1024 vertices per plane. If you don't need vertex deformation (no `uOffset` warp), drop to 1x1. For subtle effects, 16x16 is enough.
3. **Lerp smoothing** — `ease = 0.09` in hover position lerp. This is intentionally slow for buttery feel. Don't increase above 0.15 or it'll feel jittery.
4. **AbortController cleanup** — Always call `this.abortController.abort()` in destroy. Leaked listeners cause GC issues and ghost events.
5. **Texture deduplication** — TextureCache prevents loading the same image twice. Always use it. Never call `new TextureLoader().load()` directly.
6. **Dispose geometry on resize** — DOMPlane.onResize creates new geometry. Old geometry MUST be disposed or you leak GPU memory. The base class handles this.
7. **Hide DOM images** — Set `img.style.opacity = '0'` after creating the WebGL plane. Never `display: none` — that removes the element from layout and breaks getBoundingClientRect.

## Cross-Browser

- **Safari**: getBoundingClientRect can return fractional pixels differently. The world coordinate conversion handles this, but be aware of 0.5px alignment differences.
- **Mobile**: Skip hover effects entirely (no mouse). Touch events don't need velocity tracking.
- **Firefox**: getBoundingClientRect is synchronous but triggers layout. Same perf cost as Chrome.

## Key Files

- `src/canvas/DOMPlane.js` — Base class
- `src/canvas/Home/index.js` — HomeView reference implementation
- `src/canvas/utils/TextureCache.js` — Texture loader with cache + dedup
- `src/canvas/shaders/defaultVert.glsl` — Default vertex shader
- `src/canvas/shaders/defaultFrag.glsl` — Default fragment shader
