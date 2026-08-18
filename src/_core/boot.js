import SmoothScroll from '@utils/smoothscroll';
import '@utils/perf';

/**
 * Boot helpers. This project is DOM-only — the WebGL layer was removed
 * entirely on 2026-08-18 (src/canvas/, initWebGL, textureLoadAssets).
 * To resurrect it, restore from history: git show 62e2727:src/canvas/
 * and git show 16791bc:src/_core/boot.js
 */

export function initCore() {
	return new SmoothScroll();
}
