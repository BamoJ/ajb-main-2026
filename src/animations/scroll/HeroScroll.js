import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import AnimationCore from '@animations/AnimationCore';
import { isMobile } from '@utils/media';

/**
 * Home hero — scrubbed over the sticky track. Two device behaviors:
 *
 * Desktop: the artwork grows from small to full width at its NATURAL
 * aspect ratio (never cropped), then pans top-to-bottom through the
 * drawing; the pan ends bottom-aligned with the track so the sticky
 * release is the handoff into the content below. The JS re-imposes the
 * natural ratio on the box (Webflow authors it 100vw × 100vh).
 *
 * Mobile: grow-and-stick — the image scales up into the authored
 * 100vw × 100vh cover box and then does not move until the release.
 *
 * Heading choreography (same timeline, both devices): rises from its
 * resting spot to the viewport center while the image grows, then
 * keeps crawling — slower, no hold — up and off the top.
 *
 * Webflow hooks:
 *   data-anim="hero-scroll"  on .sticky_track (the tall scroll runway)
 *   data-hero-image          on the image wrap in the sticky stage
 *   data-hero-heading        on the heading wrap (exclusion-blend element)
 */
const GROW = 0.4; // portion of the track spent growing
const HEADING_CENTER_END = 0.25; // heading reaches viewport center here
const HEADING_EXIT_END = 0.85; // heading fully gone; artwork solo after

export default class HeroScroll extends AnimationCore {
	constructor(element) {
		super(element, {
			scrub: true,
			triggerStart: 'top top',
			triggerEnd: 'bottom bottom',
			invalidateOnRefresh: true,
		});
	}

	createElements() {
		this.wrap = this.element.querySelector('[data-hero-image]');
		this.img = this.wrap?.querySelector('img');
		this.heading = this.element.querySelector('[data-hero-heading]');
		if (!this.wrap || !this.img) return;

		this.mobile = isMobile();

		// Published img carries sizes="120px" — the browser would never
		// fetch a source large enough for full-bleed.
		this.img.sizes = '100vw';

		// Scale the full-size box down instead of animating width/height —
		// keeps the tween GPU-only. Phones start bigger — 0.1 of a phone
		// screen is a speck.
		gsap.set(this.wrap, {
			scale: this.mobile ? 0.35 : 0.1,
			transformOrigin: 'center center',
		});

		if (this.mobile) return;

		// Desktop: match the box to the artwork's real proportions so
		// object-fit never crops it, at any size.
		this.ratio = 3 / 2; // fallback until the image reports its size
		const applyRatio = () => {
			const { naturalWidth: w, naturalHeight: h } = this.img;
			if (!w || !h) return;
			this.ratio = h / w;
			this.wrap.style.aspectRatio = `${w} / ${h}`;
			ScrollTrigger.refresh();
		};
		gsap.set(this.wrap, { width: '100vw', height: 'auto' });
		if (this.img.naturalWidth) applyRatio();
		else
			this.img.addEventListener('load', applyRatio, { once: true });
	}

	imgHeight() {
		return window.innerWidth * this.ratio;
	}

	// Grow ends top-aligned (0 while the image still fits the viewport).
	growShift() {
		return Math.max(0, (this.imgHeight() - window.innerHeight) / 2);
	}

	// Pan ends bottom-aligned with the sticky stage — and therefore with
	// the track bottom at the moment the sticky releases.
	panShift() {
		return (window.innerHeight - this.imgHeight()) / 2;
	}

	// Rects are read only at setup/refresh (invalidateOnRefresh), never
	// per-frame; ScrollTrigger reverts transforms before measuring, so
	// these are the heading's natural (untweened) viewport coordinates.
	headingCenterShift() {
		const r = this.heading.getBoundingClientRect();
		return window.innerHeight / 2 - (r.top + r.height / 2);
	}

	headingExitShift() {
		const r = this.heading.getBoundingClientRect();
		return -(r.top + r.height);
	}

	animate() {
		if (!this.wrap || !this.img) return;

		// spine: keeps the constants meaning "fraction of the track"
		this.timeline.to({}, { duration: 1 }, 0);

		if (this.mobile) {
			// Grow into the authored full-screen cover box, then stick.
			this.timeline.to(
				this.wrap,
				{ scale: 1, duration: GROW, ease: 'none' },
				0,
			);
		} else {
			this.timeline
				.to(
					this.wrap,
					{
						scale: 1,
						y: () => this.growShift(),
						duration: GROW,
						ease: 'none',
					},
					0,
				)
				.to(
					this.wrap,
					{
						y: () => this.panShift(),
						duration: 1 - GROW,
						ease: 'none',
					},
					GROW,
				);
		}

		if (!this.heading) return;
		this.timeline
			.to(
				this.heading,
				{
					y: () => this.headingCenterShift(),
					duration: HEADING_CENTER_END,
					ease: 'none',
				},
				0,
			)
			// continues straight from center — slower (longer span for the
			// remaining distance), so it reads as a lazy drift off the top
			.to(
				this.heading,
				{
					y: () => this.headingExitShift(),
					duration: HEADING_EXIT_END - HEADING_CENTER_END,
					ease: 'none',
				},
				HEADING_CENTER_END,
			);
	}
}
