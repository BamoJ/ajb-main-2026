import FadeIn from './global/effect/FadeIn';
import LineReveal from './global/line/LineReveal';
import ParaReveal from './global/text/ParaReveal';
import HeadingReveal from './global/text/HeadingReveal';
import ImageReveal from './global/effect/ImageReveal';
import ImageParallax from './global/effect/ImageParallax';
import HeroScroll from './scroll/HeroScroll';
import { ArtworkHero, ArtworkGallery } from './scroll/ArtworkScroll';

/**
 * Animation registry — maps `data-anim*` attributes to animation classes.
 *
 * To add an animation:
 *   1. Implement an AnimationCore subclass.
 *   2. Add one line under `data-anim` here — `'my-effect': MyClass`
 *
 * No more per-type querySelectorAll. The registry is auto-scanned at
 * discovery time.
 */
const REGISTRY = {
	'data-anim': {
		// Keep the gallery PIN first: ScrollTrigger refreshes triggers in
		// creation order (no auto-sort unless refreshPriority is used), so
		// the pin must exist before triggers that can sit BELOW it in the
		// document (e.g. 'paragraph' on the artwork description) — their
		// start positions must include the pin spacer's added height.
		'artwork-hero': ArtworkHero,
		'artwork-gallery': ArtworkGallery,
		'fade-in': FadeIn,
		line: LineReveal,
		'image-reveal': ImageReveal,
		'image-parallax': ImageParallax,
		heading: HeadingReveal,
		paragraph: ParaReveal,
		'hero-scroll': HeroScroll,
	},
};

/**
 * Animation manager — discovers + sets up animations on construction,
 * activates them via `activate()` once the page is ready (after the
 * transition fade / loader).
 */
export default class Animation {
	constructor(scope = document) {
		this.collection = [];
		this.discover(scope);
	}

	discover(scope = document) {
		for (const [attr, valueMap] of Object.entries(REGISTRY)) {
			for (const [value, AnimClass] of Object.entries(valueMap)) {
				scope
					.querySelectorAll(`[${attr}="${value}"]`)
					.forEach((el) => {
						const inst = new AnimClass(el);
						inst.setup();
						this.collection.push(inst);
					});
			}
		}
	}

	/**
	 * Arm all ScrollTriggers. Called after the page is settled
	 * (post-fade scrollTo/resize) so scroll animations don't fire
	 * mid-transition.
	 */
	activate() {
		this.collection.forEach((a) => a.activate());
	}

	destroy() {
		this.collection.forEach((a) => a.destroy());
		this.collection = [];
	}
}
