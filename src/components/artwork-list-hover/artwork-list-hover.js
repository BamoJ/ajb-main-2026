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
 * Artwork list hover reveal (/artwork).
 *
 * Each `.w-dyn-item` link wraps both the text row and its own
 * `.artwork_thumb_big` (absolute, centered on the row, pointer-events
 * none, clip-path closed at center — all authored in Webflow). Hovering
 * the link wipes the thumb open from center; leaving wipes it closed,
 * with a scale settle on the img inside.
 *
 * `to` + `overwrite: true` (not fromTo): re-entering mid-close must
 * continue from the current clip value instead of snapping back to
 * fully closed.
 */
export default function artworkListHover(el) {
	if (isMobile()) return;

	const links = el.querySelectorAll('a.artwork-link');
	if (!links.length) return;

	const reduced = prefersReducedMotion();
	const controller = new AbortController();
	const thumbs = [];
	const imgs = [];

	links.forEach((link) => {
		const thumb = link.querySelector('.artwork_thumb_big');
		const img = thumb?.querySelector('img');
		if (!thumb || !img) return;

		thumbs.push(thumb);
		imgs.push(img);
		gsap.set(img, { scale: SCALE_FROM });

		const open = () => {
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
