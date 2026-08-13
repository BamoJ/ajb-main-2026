import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '@utils/media';

gsap.registerPlugin(ScrollTrigger);

/**
 * Base class for scroll-driven DOM animations.
 *
 * Subclasses override `animate()` to populate `this.timeline`. Optionally,
 * override `createElements()` to query/cache child nodes, and assign
 * `this.triggerElement` to use a different ScrollTrigger trigger than
 * `this.element`.
 *
 * Lifecycle: setup() builds the timeline; activate() creates the
 * ScrollTrigger that drives it. Page lifecycle (TransitionManager) calls
 * destroy() on every page leave — no per-instance auto-cleanup.
 */
export default class AnimationCore {
	constructor(element, options = {}) {
		this.element =
			element instanceof Element
				? element
				: document.querySelector(element);

		this.options = {
			triggerStart: 'top 90%',
			duration: 1.5,
			ease: 'power2.out',
			scrub: false,
			once: true,
			markers: false,
			...options,
		};

		this.elements = {};
		this.timeline = null;
		this.scrollTrigger = null;
	}

	createElements() {}

	createTimeline() {
		this.timeline = gsap.timeline({ paused: true });
	}

	createScrollTrigger() {
		const triggerEl = this.triggerElement || this.element;

		if (this.options.scrub) {
			this.scrollTrigger = ScrollTrigger.create({
				trigger: triggerEl,
				start: this.options.triggerStart,
				end: this.options.triggerEnd,
				animation: this.timeline,
				scrub: this.options.scrub,
				markers: this.options.markers,
				onEnter: () => this.onEnter(),
				onLeave: () => this.onLeave(),
				onEnterBack: () => this.onEnterBack(),
				onLeaveBack: () => this.onLeaveBack(),
			});
		} else {
			this.scrollTrigger = ScrollTrigger.create({
				trigger: triggerEl,
				start: this.options.triggerStart,
				markers: this.options.markers,
				once: this.options.once,
				onEnter: () => {
					this.timeline.play();
					this.onEnter();
				},
				onLeave: () => this.onLeave(),
				onEnterBack: () => this.onEnterBack(),
				onLeaveBack: () => this.onLeaveBack(),
			});
		}
	}

	// Lifecycle hooks — overridable in subclasses.
	// `once: true` (default) means only onEnter fires; set `once: false`
	// or use scrub mode to receive the full lifecycle.
	onEnter() {}
	onLeave() {}
	onEnterBack() {}
	onLeaveBack() {}

	animate() {}

	init() {
		this.setup();
		this.activate();
	}

	/**
	 * Build the timeline + animation steps. Does NOT create a ScrollTrigger.
	 * Use this when the animation needs to be armed but should not fire
	 * until something else (e.g. a WebGL flight) has finished.
	 */
	setup() {
		if (prefersReducedMotion()) return;

		if (!this.element) {
			console.warn(
				`[${this.constructor.name}] No element found; skipping setup`,
			);
			return;
		}

		this.createElements();
		this.createTimeline();
		this.animate();
		this._isSetup = true;
	}

	/**
	 * Create the ScrollTrigger that fires the animation. Must be called
	 * after `setup()`. No-op if reduced motion is on or setup failed.
	 */
	activate() {
		if (!this._isSetup) return;
		if (this._isActive) return;
		this.createScrollTrigger();
		this._isActive = true;
	}

	destroy() {
		if (this.timeline) this.timeline.kill();
		if (this.scrollTrigger) this.scrollTrigger.kill();
	}
}
