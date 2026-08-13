---
name: scroll-anim
description: Build scroll-driven DOM animations with GSAP, ScrollTrigger, and SplitText. Use when adding reveal animations, parallax effects, text animations, or any scroll-triggered animation on DOM elements.
user-invocable: true
---

# Scroll Animations — GSAP + ScrollTrigger + SplitText

## Architecture

All scroll animations extend `AnimationCore` (`src/animations/AnimationCore.js`). The `Animation` manager (`src/animations/index.js`) holds a `REGISTRY` map of `data-attr → class`, walks the DOM at construction, instantiates each match, and calls `setup()` on it. `TransitionManager` calls `activate()` once the page is ready (after the WebGL flight) so scroll triggers don't race the transition. On every Taxi `onLeave`, `Animation.destroy()` kills timelines + ScrollTriggers across the collection.

`prefersReducedMotion()` from `@utils/media` is honored — `setup()` early-returns when set, so no timelines / ScrollTriggers are created at all.

## AnimationCore Base Class

`src/animations/AnimationCore.js`

### Lifecycle (split)

```
setup()    → createElements() → createTimeline() → animate()
activate() → createScrollTrigger()
destroy()  → kills timeline + scrollTrigger
```

`setup()` builds the timeline but does NOT create a ScrollTrigger — the animation is "armed" but won't fire. `activate()` creates the ScrollTrigger and starts driving it. The split exists so scroll animations don't fire mid-WebGL-flight on page entry.

`init()` still exists as a legacy convenience that calls both. Use it only for one-off / DOM-only setups outside the Animation manager.

### Default Options

```js
{
  triggerStart: 'top 90%',  // ScrollTrigger start position
  duration: 1.5,
  ease: 'power2.out',
  scrub: false,             // false = one-shot, true/number = scrub
  once: true,               // configurable; false → re-fires on every entry
  markers: false,           // ScrollTrigger debug markers
}
```

There is **no `cleanup` option** — page-level `Animation.destroy()` handles teardown on Taxi navigation. Each scrub animation stays alive for the page lifetime, so reverse-scroll just works.

### Override Hooks

```js
class YourAnimation extends AnimationCore {
  createElements() {
    // Cache child queries, init SplitText, etc.
  }

  animate() {
    // Build the GSAP timeline (paused — ScrollTrigger plays it)
    this.timeline.from(this.element, { ... });
  }

  // Optional: override the trigger element (defaults to this.element)
  // Set in constructor: `this.triggerElement = el.querySelector('...')`

  // Optional: lifecycle hooks wired through ScrollTrigger
  onEnter() {}        // fires every time (or once, depending on `once`)
  onLeave() {}        // requires `once: false` or scrub mode
  onEnterBack() {}    // requires `once: false` or scrub mode
  onLeaveBack() {}    // requires `once: false` or scrub mode
}
```

With `once: true` (default) only `onEnter` fires — ScrollTrigger self-disables after the first trigger.

### ScrollTrigger Modes

**One-shot (default):**
```js
ScrollTrigger.create({
  trigger: triggerEl,
  start: this.options.triggerStart,
  once: this.options.once,
  onEnter: () => { this.timeline.play(); this.onEnter(); },
  onLeave: () => this.onLeave(),
  onEnterBack: () => this.onEnterBack(),
  onLeaveBack: () => this.onLeaveBack(),
});
```

**Scrub (for parallax):**
```js
ScrollTrigger.create({
  trigger: triggerEl,
  start: this.options.triggerStart,
  end: this.options.triggerEnd,
  animation: this.timeline,
  scrub: this.options.scrub,
  onEnter, onLeave, onEnterBack, onLeaveBack,
});
```

## Existing Animation Types

### FadeIn

**Data attribute:** `data-anim="fade-in"`
**File:** `src/animations/global/effect/FadeIn.js`

```js
animate() {
  this.timeline.from(this.element, {
    autoAlpha: 0,
    duration: 1.5,
    ease: 'sine.out',
  });
}
```

### LineReveal

**Data attribute:** `data-anim="line"`
**File:** `src/animations/global/line/LineReveal.js`

```js
animate() {
  this.timeline.from(this.element, {
    scaleX: 0,
    transformOrigin: '0% 50%',
    duration: 1.7,
    ease: easings.revealEase,
  });
}
```

### ImageReveal

**Data attribute:** `data-anim="image-reveal"`
**File:** `src/animations/global/effect/ImageReveal.js`

Clipping wipe from right.

### ImageParallax

**Data attribute:** `data-anim="image-parallax"`
**File:** `src/animations/global/effect/ImageParallax.js`

Scrub parallax — element pre-scaled to 1.35x, then translated on scroll. Uses `scrub: 1` and `triggerStart: 'top bottom'`, `triggerEnd: 'bottom top'`. Stays alive for the page lifetime; reverse-scroll plays the timeline backwards smoothly.

### HeadingReveal

**Data attribute:** `data-anim="heading"`
**File:** `src/animations/global/text/HeadingReveal.js`

GSAP SplitText by chars with mask. Sets `this.triggerElement` to a child element when the host is `display: contents` (which can't be a ScrollTrigger trigger).

### ParaReveal

**Data attribute:** `data-anim="paragraph"`
**File:** `src/animations/global/text/ParaReveal.js`

SplitText by lines with mask. Mobile fallback (Webflow's 991 px tablet breakpoint) skips SplitText and uses simple opacity. Re-splits text on width changes via `addResize()` from `@core/resize` (filters same-size frames automatically).

**Note:** SplitText is included in the standard `gsap` package (free since v3.13, April 2025). Import from `'gsap/SplitText'` and register with `gsap.registerPlugin(SplitText)`.

## Creating a New Animation

### 1. Create the animation class

```js
// src/animations/global/yourEffect/YourEffect.js
import AnimationCore from '@animations/AnimationCore';

export default class YourEffect extends AnimationCore {
  constructor(element) {
    super(element, {
      triggerStart: 'top 85%',
      duration: 1.2,
      ease: 'power3.out',
      // scrub: false,  // one-shot by default
      // once: true,    // default
    });
    // No init() call — Animation manager calls setup() at discovery,
    // and TransitionManager calls activate() once the page is ready.
  }

  createElements() {
    this.inner = this.element.querySelector('.inner');
  }

  animate() {
    this.timeline.from(this.inner, {
      yPercent: 30,
      autoAlpha: 0,
      duration: this.options.duration,
      ease: this.options.ease,
    });
  }
}
```

### 2. Register in animations/index.js

Add one line to the `REGISTRY` map:

```js
// src/animations/index.js
import YourEffect from './global/yourEffect/YourEffect';

const REGISTRY = {
  'data-anim': {
    'fade-in': FadeIn,
    'line': LineReveal,
    'image-reveal': ImageReveal,
    'image-parallax': ImageParallax,
    'heading': HeadingReveal,
    'paragraph': ParaReveal,
    'your-effect': YourEffect,   // ← add this
  },
};
```

The Animation manager auto-scans every entry in the registry, builds the selector (`[data-anim="<value>"]`), instantiates `new YourEffect(el)`, and calls `setup()` on each.

### 3. Add data attribute in Webflow

```html
<div data-anim="your-effect">
  <div class="inner">Content to animate</div>
</div>
```

## Custom Easings

`src/utils/easings.js`

Available easings (registered with GSAP CustomEase):
- `revealEase` — smooth reveal wipe curve (used by LineReveal, ImageReveal)
- `paragraphEase` — text reveal curve (used by ParaReveal)
- `heading` — heading char reveal curve (used by HeadingReveal)

CSS easing custom properties are also available in `src/styles/easings.css`.

## 60fps Rules

1. **No self-cleaning** — animations stay alive for the page lifetime; teardown happens once via `Animation.destroy()` on Taxi `onLeave`. Don't add cleanup logic to `onComplete`.
2. **`once: true` for one-shots** — default. ScrollTrigger self-disables after firing, freeing the listener. Set `once: false` only when you need re-fires on every viewport entry.
3. **Width-only resize guard** — for SplitText animations that re-split on resize, only re-split on width change (`@core/resize` filters same-size frames automatically — see `ParaReveal.js`). Don't re-split on every mobile-toolbar show/hide.
4. **Mobile fallback** — heavy SplitText / GSAP setups should fall back to simple opacity on mobile. ParaReveal does this at 991 px. Always provide a mobile path.
5. **Stagger budget** — keep stagger count reasonable. 50+ staggered elements will cause frame drops on entry. Use `stagger: { from: 'start', amount: 0.3 }` instead of `each` for big lists.
6. **`autoAlpha` over `opacity`** — `autoAlpha` sets `visibility: hidden` at 0, removing the element from compositing.
7. **GSAP lagSmoothing(0)** — set globally in `smoothscroll.js`. Don't change.
8. **ScrollTrigger + Lenis sync** — `lenis.on('scroll', () => ScrollTrigger.update())` is wired in `smoothscroll.js`. If you add custom scroll listeners, use Lenis events.
9. **No layout reads in `animate()`** — don't call `getBoundingClientRect`, `offsetHeight` inside `animate()`. Cache in `createElements()`. Use `clientRect()` from `@utils/client-rect` if you need an enriched rect.
10. **Prefer transforms** — animate `x`, `y`, `scale`, `rotation` (GPU-composited). Avoid `width`, `height`, `top`, `left` (triggers layout).

## Cross-Browser

- **Safari**: ScrollTrigger pin + fixed position can flicker. Use `pinType: 'transform'` if pinning.
- **Mobile Safari**: SplitText with `mask: 'lines'` can cause anti-aliasing artifacts on retina. Test on device.
- **Firefox**: text rendering differences mean SplitText line breaks may differ. Always cross-test.
- **Reduced motion**: `prefersReducedMotion()` in `setup()` short-circuits the whole pipeline. No timelines, no ScrollTriggers.
- **Low-end devices**: skip SplitText entirely. Use simple opacity / transform reveals.

## Key Files

- `src/animations/AnimationCore.js` — Base class (setup/activate split)
- `src/animations/index.js` — REGISTRY-based discovery + Animation manager
- `src/animations/global/` — All animation implementations
- `src/utils/easings.js` — Custom GSAP easings
- `src/utils/media.js` — `prefersReducedMotion()`, `isMobile()`
- `src/_core/resize.js` — `addResize()` for re-split on resize
- `src/utils/smoothscroll.js` — Lenis + ScrollTrigger sync
