import SmoothScroll from '@utils/smoothscroll';
import Canvas from '@canvas';
import TextureCache from '@canvas/utils/TextureCache';
import '@utils/perf';

/**
 * Boot helpers — wire what your project needs, delete what it doesn't.
 *
 * Full WebGL + Taxi:   initCore() + initWebGL() + new TransitionManager()
 * WebGL, no Taxi:      initCore() + initWebGL() + discoverComponents() + runMount()
 * DOM-only:            initCore() + discoverComponents() + runMount()
 *   (delete initWebGL and Canvas imports — Three.js is tree-shaken out)
 */

export function initCore() {
	return new SmoothScroll();
}

export function initWebGL({ pages = {} } = {}) {
	return new Canvas(pages);
}

/**
 * Preloader-compatible asset loader that warms the TextureCache.
 * Pass as `loadAssets` to Preloader in WebGL projects.
 */
export function textureLoadAssets(onProgress) {
	const images = [...document.querySelectorAll('img[src]')];
	const total = images.length;
	if (total === 0) {
		onProgress(95);
		return Promise.resolve();
	}
	let loaded = 0;
	return Promise.all(
		images.map((img) =>
			TextureCache.load(img.src)
				.then(() => onProgress((++loaded / total) * 95))
				.catch(() => onProgress((++loaded / total) * 95)),
		),
	).then(() => onProgress(95));
}
