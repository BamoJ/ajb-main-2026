import gsap from 'gsap';
import { onDestroy } from '@core/hooks';
import { isMobile, prefersReducedMotion } from '@utils/media';
import { easings } from '@utils/easings';

// Same 2-value inset shorthand as the Webflow-authored clip-path, so
// GSAP interpolates format-to-format.
const CLOSED = 'inset(50% 0%)';
const OPEN = 'inset(0% 0%)';
const SCALE_FROM = 1.25;
const DURATION_IN = 0.9;
const DURATION_OUT = 0.3;

/**
 * List hover reveal, viewport-centered (/artwork rows, /shop products).
 *
 * Two collection lists off the same collection, same sort: the visible
 * rows (`data-hover-link` on each `<a>`) and a fixed, centered stack of
 * big thumbs (`data-hover-thumb` on each clip target, authored closed
 * at `inset(50% 0%)`, pointer-events none up its wrapper chain).
 * Pairing is by INDEX — Webflow renders both lists in identical order.
 * Hovering row i wipes thumb i open from center; leaving wipes it
 * closed, with a scale settle on the img inside. On open the thumb's
 * collection item is z-raised so the incoming wipe always plays over
 * the outgoing close.
 *
 * `to` + `overwrite: true` (not fromTo): re-entering mid-close must
 * continue from the current clip value instead of snapping back to
 * fully closed.
 */
export default function artworkListHover(el) {
	if (isMobile()) return;

	const links = el.querySelectorAll('[data-hover-link]');
	const thumbs = el.querySelectorAll('[data-hover-thumb]');
	if (!links.length || !thumbs.length) return;
	if (links.length !== thumbs.length) {
		console.warn(
			`[artwork-list-hover] ${links.length} links vs ${thumbs.length} thumbs — lists out of sync`,
		);
		return;
	}

	const reduced = prefersReducedMotion();
	const controller = new AbortController();
	const imgs = [];
	let zTop = 0;

	links.forEach((link, i) => {
		const thumb = thumbs[i];
		const img = thumb.querySelector('img');
		if (!img) return;

		imgs.push(img);
		gsap.set(img, { scale: SCALE_FROM });

		const open = () => {
			gsap.set(thumb.closest('.w-dyn-item') || thumb, {
				zIndex: ++zTop,
			});
			if (reduced) {
				gsap.set(thumb, { clipPath: OPEN });
				gsap.set(img, { scale: 1 });
				return;
			}
			gsap.to(thumb, {
				clipPath: OPEN,
				duration: DURATION_IN,
				ease: easings.revealEase,
				overwrite: true,
			});
			gsap.to(img, {
				scale: 1,
				duration: DURATION_IN,
				ease: easings.revealEase,
				overwrite: true,
			});
		};

		const close = () => {
			if (reduced) {
				gsap.set(thumb, { clipPath: CLOSED });
				gsap.set(img, { scale: SCALE_FROM });
				return;
			}
			gsap.to(thumb, {
				clipPath: CLOSED,
				duration: DURATION_OUT,
				ease: easings.revealEase,
				overwrite: true,
			});
			gsap.to(img, {
				scale: SCALE_FROM,
				duration: DURATION_OUT,
				ease: easings.revealEase,
				overwrite: true,
			});
		};

		link.addEventListener('mouseenter', open, {
			signal: controller.signal,
		});
		link.addEventListener('mouseleave', close, {
			signal: controller.signal,
		});
	});

	onDestroy(() => {
		controller.abort();
		gsap.killTweensOf([...thumbs, ...imgs]);
	});
}
