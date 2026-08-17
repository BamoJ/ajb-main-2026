import { Observe, onView } from './observe';
import { onDestroy } from './hooks';
import { addResize } from './resize';
import SmoothScroll from '@utils/smoothscroll';
import { clamp, map } from '@utils/math';

const DEFAULT_CONFIG = {
	bounds: [0, 1],
	top: 'bottom', // 'top' | 'center' | 'bottom' — viewport reference for the element's TOP edge
	bottom: 'top', // viewport reference for the element's BOTTOM edge
	callback: undefined,
};

function computeBounds(el, config) {
	const rect = el.getBoundingClientRect();
	const wh = window.innerHeight;
	const offset = rect.top + window.scrollY;
	const offsetBottom = offset + rect.height;
	const centerOffset = wh / 2;

	const topPos =
		offset -
		(config.top === 'center'
			? centerOffset
			: config.top === 'bottom'
				? wh
				: 0);

	const bottomPos =
		offsetBottom -
		(config.bottom === 'center'
			? centerOffset
			: config.bottom === 'bottom'
				? wh
				: 0);

	return { top: topPos, bottom: bottomPos };
}

function getScrollY() {
	const lenis = SmoothScroll.instance?.lenis;
	return lenis
		? (lenis.actualScroll ?? lenis.scroll ?? window.scrollY)
		: window.scrollY;
}

function subscribeScroll(fn) {
	const lenis = SmoothScroll.instance?.lenis;
	if (lenis && typeof lenis.on === 'function') {
		lenis.on('scroll', fn);
		return () => lenis.off('scroll', fn);
	}
	const handler = () => fn();
	window.addEventListener('scroll', handler, { passive: true });
	return () => window.removeEventListener('scroll', handler);
}

/**
 * Tracks scroll progress of an element through the viewport as a 0–1 value.
 * Fires `callback(value)` continuously while the element is in view.
 *
 * Default config: value is 0 when the element's TOP hits viewport BOTTOM,
 * and 1 when the element's BOTTOM hits viewport TOP — i.e. the full sweep
 * through the viewport.
 */
export class Track extends Observe {
	constructor(element, config = {}) {
		super(element, { autoStart: true, once: false, threshold: 0 });

		this.config = { ...DEFAULT_CONFIG, ...config };
		this.value = 0;
		this.init = false;

		this._handleResize = () => {
			this.bounds = computeBounds(this.element, this.config);
			this._handleScroll();
		};
		this._handleScroll = () => {
			if (!this.inView || !this.init) return;
			this.value = clamp(
				map(
					getScrollY(),
					this.bounds.top,
					this.bounds.bottom,
					this.config.bounds[0],
					this.config.bounds[1],
				),
				0,
				1,
			);
			this.config.callback?.(this.value);
		};

		this.bounds = computeBounds(this.element, this.config);
		this._unsubScroll = subscribeScroll(this._handleScroll);
		this._unsubResize = addResize(this._handleResize, 1);
		this.init = true;
		this._handleScroll();
	}

	isIn() {
		this._handleScroll();
	}

	destroy() {
		this.config.callback = undefined;
		this._unsubScroll?.();
		this._unsubResize?.();
		super.destroy();
	}
}

/**
 * Convenience: create a `Track` and auto-clean up via `onDestroy`.
 */
export function onTrack(element, config = {}) {
	const track = new Track(element, config);
	onDestroy(() => track.destroy());
	return track;
}

// onView re-exported for one-stop core API
export { onView };
