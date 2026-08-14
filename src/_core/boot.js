import SmoothScroll from '@utils/smoothscroll';
import '@utils/perf';

/**
 * Boot helpers — this project is DOM-only, so the WebGL helpers
 * (initWebGL, textureLoadAssets, and their Canvas/TextureCache imports)
 * are deleted to keep Three.js out of the bundle.
 * To re-enable WebGL, restore them from the starter:
 *   git show 16791bc:src/_core/boot.js
 */

export function initCore() {
	return new SmoothScroll();
}
