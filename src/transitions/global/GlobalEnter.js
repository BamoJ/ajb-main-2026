import { Transition } from '@unseenco/taxi';
import { gsap } from 'gsap';
import SplitText from 'gsap/SplitText.js';
import { prefersReducedMotion } from '@utils/media';

/**
 * GlobalTransition — the default transition for every page: the old view
 * fades out while the new one fades in, then the shared hero enter
 * (composeHeroEnter, below) plays on top. All timing is inline in the
 * tweens — tune there.
 */
export default class GlobalTransition extends Transition {
	onLeave({ done }) {
		done();
	}

	onEnter({ to }, animationComplete) {
		// Outgoing views read from the live DOM — cached refs go stale
		// under Taxi's removeOldContent: false.
		const outgoing = [
			...document.querySelectorAll('[data-taxi-view]'),
		].filter((v) => v !== to);

		if (prefersReducedMotion()) {
			gsap.set(to, { clearProps: 'opacity' });
			gsap.set(outgoing, { opacity: 0 });
			animationComplete();
			return;
		}

		gsap.set(to, { opacity: 0 }); // no first-frame flash
		const tl = gsap.timeline();

		// Old view out, new view in.
		tl.to(
			outgoing,
			{
				opacity: 0,
				duration: 0.5,
				ease: 'sine.out',
			},
			0,
		);
		tl.to(
			to,
			{
				opacity: 1,
				duration: 0.5,
				ease: 'power1.out',
			},
			0.2,
		);
		// The page goes interactive HERE (view sweep, re-init, scroll
		// restart) — the hero beats composed below keep playing past it.
		tl.call(() => {
			gsap.set(to, { clearProps: 'opacity' });
			animationComplete();
		});

		this.composeEnter(to, tl);
	}

	// Override in a per-page transition class for bespoke reveals.
	composeEnter(to, tl) {
		composeHeroEnter(to, tl);
	}
}

/**
 * Shared hero enter — plays on every page, SPA nav and hard load alike
 * (transitions/index.js composes it onto the hard-load timeline too).
 * Optional Webflow hooks:
 *
 *   [data-hero-image]    clips open bottom→top — the visual kicks first
 *   [data-hero-heading]  SplitText lines rise out of masks
 *   [data-hero-content]  fades in
 *
 * Only clip-path / yPercent-on-line-divs / opacity are animated, so the
 * HeroScroll & ArtworkHero scrubs never conflict. A hero-tagged element
 * must NOT also carry data-anim. Missing hooks = plain crossfade.
 */
export function composeHeroEnter(view, tl) {
	const media = view.querySelector('[data-hero-image]');
	const heading = view.querySelectorAll('[data-hero-heading]');
	const content = view.querySelector('[data-hero-content]');

	if (media) {
		tl.from(
			media,
			{
				clipPath: 'inset(100% 0% 0% 0%)',
				duration: 1.5,
				ease: 'power4.inOut',
			},
			0.23, // with the fade-in start
		);
	}

	if (heading) {
		const split = new SplitText(heading, {
			type: 'lines',
			mask: 'lines',
			linesClass: 'lineChildren',
		});
		tl.from(
			split.lines,
			{
				yPercent: 120,
				duration: 1.2,
				ease: 'power3.out',
				stagger: 0.08,
			},
			media ? '<+0.9' : 0.7, // ride the visual; none → heading leads
		);
	}

	if (content) {
		tl.from(
			content,
			{
				opacity: 0,
				duration: 1,
				ease: 'sine.out',
			},
			'<50%', // halfway into the heading rise
		);
	}
}
