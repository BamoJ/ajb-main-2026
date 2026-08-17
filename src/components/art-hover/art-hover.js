import gsap from 'gsap';
import { onDestroy } from '@core/hooks';
import { onView } from '@core/observe';
import { isMobile, prefersReducedMotion } from '@utils/media';
import { easings } from '@utils/easings';

const HIDDEN = 'inset(100% 0% 0% 0%)';
const SHOWN = 'inset(0% 0% 0% 0%)';
const SCALE_FROM = 1.25;
const DURATION = 1.5;
const ENTRANCE_DURATION = 1.7;
const ENTRANCE_IMG_AT = '<45%';

/**
 * Featured artwork: scroll-in entrance + hover reveal (homepage).
 *
 * A cloned backdrop holds the beige box AND the settled image; the
 * CMS panels are pure animation layers stacked above it. So every
 * panel is always closed when a hover starts — every hover plays a
 * full wipe, and nothing beneath can ever vanish, because what's
 * beneath is the backdrop and hover logic never touches it.
 */
export default function artHover(el) {
	if (isMobile()) return;

	const links = el.querySelectorAll('a.featured_art_link');
	const thumbs = new Map();
	el.querySelectorAll('[data-art-slug]').forEach((wrp) => {
		const img = wrp.querySelector('img');
		if (!img) return;
		thumbs.set(wrp.dataset.artSlug, {
			item: wrp.closest('.home_artwork_item') || wrp,
			mask: wrp.querySelector('.featured_img_mask') || img,
			wrp,
			img,
		});
	});
	if (!links.length || !thumbs.size) return;

	const all = [...thumbs.values()];
	const imgs = all.map((t) => t.img);
	const masks = all.map((t) => t.mask);
	const list = el.querySelector('.home_artwork_list');
	const first = all[0];
	if (!list) return;

	// Backdrop: a clone of the first item (image included) pinned
	// under the stack. It shows the settled artwork at all times, so
	// the real panels are free to always wipe in from closed.
	const backdrop = first.item.cloneNode(true);
	backdrop.querySelectorAll('[data-art-slug]').forEach((n) => {
		n.removeAttribute('data-art-slug');
	});
	const back = {
		wrp: backdrop.querySelector('.wrp-img-highlight') || backdrop,
		mask: backdrop.querySelector('.featured_img_mask'),
		img: backdrop.querySelector('img'),
	};
	gsap.set(backdrop, { zIndex: 0 });
	list.insertBefore(backdrop, list.firstChild);

	// Panels: pure animation layers above the backdrop — transparent
	// so the backdrop's image shows through while they wipe.
	gsap.set(
		all.map((t) => t.item),
		{ zIndex: 1 },
	);
	gsap.set(
		all.map((t) => t.wrp),
		{ backgroundColor: 'transparent' },
	);
	gsap.set(masks, { clipPath: HIDDEN });
	gsap.set(imgs, { scale: SCALE_FROM });

	const reduced = prefersReducedMotion();
	let zTop = 1;
	let current = first;

	// Move a settled artwork onto the backdrop and reset the panels.
	// Only ever called while `from` fully covers the box, so the
	// handover is invisible.
	const settle = (from) => {
		const src = from.img.currentSrc || from.img.src;
		const apply = () => {
			gsap.set(masks, { clipPath: HIDDEN });
			gsap.set(imgs, { scale: SCALE_FROM });
		};
		if (back.img && back.img.src !== src) {
			back.img.srcset = from.img.srcset || '';
			back.img.sizes = from.img.sizes || '';
			back.img.src = src;
			// Wait for the pixels before dropping the panel that is
			// currently showing them.
			if (back.img.decode) {
				back.img.decode().then(apply, apply);
				return;
			}
		}
		apply();
	};

	const show = (slug) => {
		const next = thumbs.get(slug);
		if (!next || next === current) return;
		current = next;

		gsap.set(next.item, { zIndex: ++zTop });

		if (reduced) {
			gsap.set(next.mask, { clipPath: SHOWN });
			gsap.set(next.img, { scale: 1 });
			settle(next);
			return;
		}

		gsap.fromTo(
			next.mask,
			{ clipPath: HIDDEN },
			{
				clipPath: SHOWN,
				duration: DURATION,
				ease: easings.revealEase,
				overwrite: true,
				onComplete: () => settle(next),
			},
		);
		gsap.fromTo(
			next.img,
			{ scale: SCALE_FROM },
			{
				scale: 1,
				duration: DURATION,
				ease: easings.revealEase,
				overwrite: true,
			},
		);
	};

	const controller = new AbortController();
	let armed = false;
	const armHover = () => {
		if (armed) return;
		armed = true;
		links.forEach((link) => {
			const slug = new URL(link.href, location.origin).pathname
				.split('/')
				.filter(Boolean)
				.pop();
			link.addEventListener('mouseenter', () => show(slug), {
				signal: controller.signal,
			});
		});
	};

	let entrance = null;
	if (reduced) {
		armHover();
	} else {
		// Entrance runs entirely on the backdrop: beige box wipes in
		// bottom→up, then the artwork follows inside it.
		gsap.set(back.wrp, { clipPath: HIDDEN });
		entrance = gsap.timeline({
			paused: true,
			onComplete: () => {
				gsap.set(back.wrp, { clearProps: 'clipPath' });
				armHover();
			},
		});
		entrance.fromTo(
			back.wrp,
			{ clipPath: HIDDEN },
			{
				clipPath: SHOWN,
				duration: ENTRANCE_DURATION,
				ease: easings.revealEase,
			},
		);
		if (back.mask) {
			entrance.fromTo(
				back.mask,
				{ clipPath: HIDDEN },
				{
					clipPath: SHOWN,
					duration: ENTRANCE_DURATION,
					ease: easings.revealEase,
				},
				ENTRANCE_IMG_AT,
			);
		}
		if (back.img) {
			entrance.fromTo(
				back.img,
				{ scale: SCALE_FROM },
				{
					scale: 1,
					duration: ENTRANCE_DURATION,
					ease: easings.revealEase,
				},
				'<',
			);
		}
		onView(backdrop, {
			once: true,
			autoStart: true,
			rootMargin: '0px 0px -15% 0px',
			callback: ({ isIn }) => isIn && entrance.play(),
		});
	}

	onDestroy(() => {
		controller.abort();
		entrance?.kill();
		gsap.killTweensOf(imgs);
		gsap.killTweensOf(masks);
		if (back.mask) gsap.killTweensOf([back.wrp, back.mask, back.img]);
		backdrop.remove();
	});
}
