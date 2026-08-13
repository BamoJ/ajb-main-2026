---
name: webflow
description: Webflow integration patterns for this boilerplate. Use when setting up data attributes, connecting Webflow HTML to the JS/WebGL layer, configuring the preloader, or troubleshooting Webflow-specific issues.
user-invocable: true
---

# Webflow — Integration Patterns

## How This Works

HTML lives in **Webflow** (designed, built, and hosted there). This repo is the **JS/WebGL layer** — a single IIFE bundle (`dist/main.js`) injected via `<script>` tag in Webflow's custom code settings.

Webflow handles: layout, responsive design, CMS, hosting, forms.
This bundle handles: WebGL effects, page transitions (SPA), smooth scroll, scroll animations.

## Entry Point

`src/main.js` waits for Webflow's runtime:

```js
window.Webflow?.push(() => {
  new App();
});
```

`window.Webflow.push()` is Webflow's ready callback — equivalent to `DOMContentLoaded` but waits for Webflow's own initialization (interactions, CMS binding, etc.).

## Build Output

```
bun run build → dist/main.js
```

Single IIFE file. CSS is inlined by `vite-plugin-css-injected-by-js`. No external CSS file needed.

Add to Webflow via the **hybrid auto-switching loader** (full snippet in `README.md`). Behavior:

- Production domain → loads from Vercel directly
- `*.webflow.io` (staging) → auto-loads from `localhost:3000` if dev server is running, falls back to Vercel otherwise
- `?dev=true` query param → forces dev mode on production domain (escape hatch)

No manual toggling needed for typical staging work.

## Data Attribute Conventions

All JS hooks use `data-*` attributes on Webflow elements. No classes are used for JS targeting.

### Page Routing

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-page="home"` | `<body>` or wrapper | Identifies current page for Canvas routing |
| `data-taxi-view` | Page content wrapper | Taxi's page view container (what gets swapped) |
| `data-taxi-ignore` | `<a>` tags | Excludes link from SPA routing (full page load) |

### Auto-Discovered Components

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-component="name"` | Any element | Auto-mounts the factory at `src/components/<anywhere>/<name>.js` (filename = name, lowercased). See `/component` skill. |

### WebGL

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-gl="img"` | `<img>` or element | Marks element for WebGL plane conversion |
| `data-gl-src="url"` | Same as above | Override texture source (different from img.src) |
| `data-gl-container` | Parent wrapper | Hover/click area for WebGL interactions |

### Preloader

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-loader="wrapper"` | Loader container | Preloader wrapper (hidden after load) |
| `data-loader="loader-num"` | Number element | Displays loading percentage |
| `data-loader="progress-bar"` | Bar element | Width-based progress indicator |

### Scroll Animations

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-anim="fade-in"` | Any element | FadeIn animation |
| `data-anim="line"` | Line/divider | LineReveal (scaleX wipe) |
| `data-anim="image-reveal"` | Image wrapper | ImageReveal (clip wipe) |
| `data-anim="image-parallax"` | Image | ImageParallax (scrub parallax) |
| `data-anim="heading"` | Heading text | HeadingReveal (SplitText chars) |
| `data-anim="paragraph"` | Paragraph text | ParaReveal (SplitText lines) |

### Smooth Scroll

| Attribute | On | Purpose |
|-----------|-----|---------|
| `data-lenis-prevent` | Scrollable container | Prevents Lenis on nested scrollable area |

## Webflow Structure Requirements

### Minimal Page Structure

```html
<body data-page="home">
  <!-- Preloader -->
  <div data-loader="wrapper">
    <span data-loader="loader-num">0</span>
    <div data-loader="progress-bar"></div>
  </div>

  <!-- Page content (Taxi view) -->
  <div data-taxi-view>
    <!-- Your Webflow content -->

    <!-- WebGL images -->
    <div data-gl-container>
      <a href="/project-slug">
        <img data-gl="img" src="image.jpg" />
      </a>
    </div>

    <!-- Animated elements -->
    <h1 data-anim="heading">Title</h1>
    <p data-anim="paragraph">Body text</p>
    <div data-anim="fade-in">Fades in</div>
  </div>

  <!-- Canvas container (for Three.js) -->
  <div class="canvas"></div>
</body>
```

### Canvas Element

The Three.js canvas is appended to `.canvas`:
```html
<div class="canvas"></div>
```

Style in Webflow:
```css
.canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}
```

`pointer-events: none` lets DOM clicks pass through the WebGL layer.

## Taxi.js Link Interception

Taxi intercepts all links except:
```
a:not([target]):not([href^=\\#]):not([data-taxi-ignore])
```

- External links (`target="_blank"`) → full page load
- Hash links (`#section`) → native scroll
- Ignored links (`data-taxi-ignore`) → full page load
- Everything else → SPA navigation

### Webflow CMS Links

Webflow CMS links work automatically with Taxi if they're relative paths. If you need a CMS link to bypass SPA routing:

```html
<a href="/external-page" data-taxi-ignore>Skip SPA</a>
```

## Page Detection

`detectPageName()` tries in order:
1. `data-page` attribute on body or any `[data-page]` element
2. `data-canvas-page` attribute
3. URL path matching against the page registry in `main.js`

For reliable detection, always set `data-page` on the body in Webflow.

URL matching rules:
- `/` → `home` or `index`
- `/about` → `about` (if registered in pages)
- `/work/project-slug` → tries `work` (first segment)

## Preloader Setup

The Preloader (`src/transitions/Preloader.js`) needs:

1. DOM elements with `data-loader` attributes
2. A `readySignal` in main.js (e.g., `'home:enter-ready'`)
3. The page must emit that signal when WebGL is ready

Flow:
```
Show loader → load all <img> textures → start app → wait for readySignal → hide loader
```

Progress is displayed as a number (0–100) and a width-based bar.

**Minimum duration:** 400ms. Prevents flash-of-loader on fast connections.

## Webflow Interactions Coexistence

Webflow's native interactions (IX2) can coexist with this bundle:
- Use Webflow interactions for simple hover/click states
- Use this bundle's animation system for scroll-triggered animations
- Don't use both on the same element — conflicts will occur

If you use Webflow interactions for an element, add `data-taxi-ignore` to prevent Taxi from interfering with Webflow-managed transitions.

### Re-init after Taxi swaps (`resetWebflow`)

After every Taxi page swap, `TransitionManager` calls `resetWebflow()` from `@webflow/reset-webflow`. That runs `window.Webflow.forEach(wf => { wf.destroy(); wf.ready() })` so Webflow native JS — forms, tabs, sliders, dropdowns, IX2 — re-initializes against the new DOM. Without this, anything Webflow-managed would be inert on the new page.

You don't need to call this manually. It's wired into the transition lifecycle.

## Webflow Designer / Editor Mode

`@webflow/detect-editor` ships with the boilerplate. A `MutationObserver` on `document.body.firstElementChild` watches for `.w-editor-publish-node` and pauses Lenis when the Designer is active (so Webflow's own scroll handling doesn't fight ours). Resumes when you exit the editor.

Wired into `SmoothScroll`'s constructor — no setup required.

## 60fps Rules for Webflow

1. **Image optimization** — Webflow's responsive images are crucial. Use `srcset` and `sizes` attributes. For WebGL textures, `data-gl-src` can point to a smaller version than the visible `<img>`.
2. **Lazy loading** — Webflow supports native lazy loading. However, images converted to WebGL planes (`data-gl="img"`) are loaded eagerly by TextureCache during preload. Set these to `loading="eager"` or remove `loading="lazy"` in Webflow.
3. **Font loading** — Webflow fonts load before `window.Webflow.push()` fires, so SplitText measurements are reliable.
4. **CMS list limits** — If a CMS list generates 50+ WebGL images, performance will suffer. Paginate or limit the list in Webflow.
5. **Webflow animations** — Disable any Webflow scroll animations on elements that this bundle also animates. Double-animation = double the work.

## Dev Server Integration

During development:
```bash
bun run dev  # starts at localhost:3000
```

In Webflow custom code, point to the dev server:
```html
<script src="http://localhost:3000/src/main.js" type="module"></script>
```

Note: dev mode uses ES modules (`type="module"`), production uses IIFE (no type attribute needed).

## Key Files

- `src/main.js` — Entry point with `window.Webflow.push()`
- `src/transitions/Preloader.js` — Preloader DOM requirements
- `src/transitions/index.js` — Taxi setup (link interception)
- `src/canvas/index.js` — Canvas `.canvas` container
- `vite.config.js` — Build config (IIFE output, CSS injection)
- `package.json` — Build commands
