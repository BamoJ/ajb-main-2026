import { SRGBColorSpace, WebGLRenderer } from 'three';

/**
 * RendererPool — persistent WebGL contexts for own-canvas overlay effects
 * (per-component canvases layered over DOM elements, separate from the main
 * Canvas).
 *
 * Creating a fresh WebGLRenderer per page visit and forceContextLoss()-ing it
 * on Taxi leave means synchronous context creations inside every enter
 * transition plus constant context-lost churn. The pool creates a context on
 * first acquire and reuses it for the whole session: release() detaches the
 * canvas and shrinks the drawing buffer, never disposes. Bonus: three.js
 * program caches live in the renderer, so effect shaders compile once per
 * session instead of once per visit.
 *
 * Usage in a component:
 *   import { acquire, release } from '@canvas/utils/RendererPool';
 *   const handle = acquire();          // { renderer, canvas }
 *   hostEl.appendChild(handle.canvas);
 *   onDestroy(() => release(handle));  // defer past the crossfade if the
 *                                      // last frame should fade with the view
 */
const free = [];

function create() {
	const renderer = new WebGLRenderer({
		alpha: true,
		antialias: true,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = SRGBColorSpace;
	return { renderer, canvas: renderer.domElement };
}

export function acquire() {
	while (free.length) {
		const handle = free.pop();
		// A pooled context can still be lost for real (GPU reset, tab eviction) —
		// drop it and build a fresh one.
		if (handle.renderer.getContext()?.isContextLost?.()) {
			handle.renderer.dispose();
			continue;
		}
		return handle;
	}
	return create();
}

export function release(handle) {
	if (!handle) return;
	handle.canvas.remove();
	handle.canvas.removeAttribute('style'); // no stale inline styles for the next user
	handle.renderer.setSize(1, 1, false); // free the big drawing buffer while parked
	free.push(handle);
}
