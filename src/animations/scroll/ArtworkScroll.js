import { ScrollTrigger } from 'gsap/ScrollTrigger';
import AnimationCore from '@animations/AnimationCore';

/**
 * Artwork detail page — the full scroll story, top to bottom.
 *
 * ArtworkHero: scrubbed over the 250vh sticky track. The artwork loads
 * small at the bottom of the viewport, then rises and scales into its
 * authored Webflow position/size — the end state is untouched CSS.
 *
 * ArtworkGallery: pins .art_image_gallery (the gallery wrapper inside
 * .section-gallery) and slides the .art_lightbox strip left. Travel is
 * measured from the real item rects at refresh
 * time (CMS lists vary per collection page), and the pin length equals
 * the travel, so scroll maps 1:1 px to strip movement. Ends with the
 * last artwork flush against the right content edge.
 *
 * Webflow hooks (artwork CMS template):
 *   data-anim="artwork-hero"     on .sticky_track.is-artpage
 *   data-anim="artwork-gallery"  on .section-gallery
 */
const SCALE_FROM = 0.3; // artwork size at page load

export class ArtworkHero extends AnimationCore {
	constructor(element) {
		super(element, {
			scrub: true,
			triggerStart: 'clamp(top top)',
			triggerEnd: 'bottom bottom',
			invalidateOnRefresh: true,
		});
	}

	createElements() {
		this.wrap = this.element.querySelector('.artwork_visual_top');
		// .artwork_visual_top has NO authored width (only max-width) — it
		// shrink-wraps the lazy img, so its box size settles when the
		// image loads. Re-measure everything once at that moment.
		const img = this.wrap?.querySelector('img');
		if (img && !img.complete) {
			img.addEventListener('load', () => ScrollTrigger.refresh(), {
				once: true,
			});
		}
	}

	animate() {
		if (!this.wrap) return;
		// Static values only — nothing measured, nothing to mis-measure.
		// from()'s immediateRender paints the load state at setup() even
		// though the timeline is paused; the scrub plays back to the
		// authored Webflow state. No ease override: the validated feel
		// runs on GSAP's default ease.
		this.timeline.from(this.wrap, {
			scale: SCALE_FROM,
			y: '25vh',
			transformOrigin: 'center center',
		});
	}
}

export class ArtworkGallery extends AnimationCore {
	constructor(element) {
		super(element, {
			scrub: true,
			pin: true,
			triggerStart: 'center center',
			invalidateOnRefresh: true,
		});
		// Pin length == travel distance → 1:1 px scroll-to-strip feel.
		// Assigned post-super so the arrow can close over `this`.
		this.options.triggerEnd = () => '+=' + this.distance();
	}
	ß;
	setup() {
		if (window.matchMedia('(max-width: 479px)').matches) return;
		super.setup();
	}

	createElements() {
		this.strip = this.element.querySelector('.art_lightbox');
		// Pin the gallery wrapper, NOT the whole section (per Bamo): the
		// section with its 16rem paddings + meta row is taller than the
		// viewport, so pinning it could only ever frame its top slice.
		// pin: true pins the trigger element.
		this.triggerElement = this.element.querySelector(
			'.art_image_gallery',
		);
	}

	// Reveal-all travel: the last item ends flush with the section's
	// right content edge. Measured with pin + timeline reverted
	// (ScrollTrigger refresh semantics), so rects are natural layout
	// with the strip at x:0.
	distance() {
		const last = this.strip && this.strip.lastElementChild;
		if (!last) return 0;
		const l = last.getBoundingClientRect();
		const s = this.element.getBoundingClientRect();
		const pad =
			parseFloat(getComputedStyle(this.element).paddingRight) || 0;
		const d = Math.max(0, Math.round(l.right - (s.right - pad)));
		// TEMP DEBUG — remove after validation
		console.log('[ArtworkGallery] distance', {
			lastRight: Math.round(l.right),
			sectionRight: Math.round(s.right),
			pad,
			d,
			sectionH: Math.round(s.height),
			viewportH: window.innerHeight,
			itemH: Math.round(l.height),
		});
		return d;
	}

	animate() {
		if (!this.strip) return;
		this.timeline.to(this.strip, {
			x: () => -this.distance(),
			duration: 1,
			ease: 'none',
		});
	}
}
