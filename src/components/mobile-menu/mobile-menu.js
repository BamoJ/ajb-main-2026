import gsap from 'gsap';
import { onDestroy } from '@core/hooks';
import { prefersReducedMotion } from '@utils/media';
import SmoothScroll from '@utils/smoothscroll';

// Same 3-value inset shorthand as the Webflow-authored clip-path on
// `.mobile_menu_container`, so GSAP interpolates format-to-format.
const HIDDEN = 'inset(0% 0% 100%)';
const OPEN = 'inset(0% 0% 0%)';

// Menu text and the "Close" label both ride 110% of their own height
// inside an `overflow: clip` parent — `.mobile_menu_link_wrap` and
// `.nav-mobile-button` respectively (both authored in Webflow).
const Y_FROM = 110;

// The menu only exists under Webflow's mobile-portrait breakpoint:
// `.nav-mobile-button` is display:none until here.
const BREAKPOINT = '(max-width: 479px)';

/**
 * Mobile menu (<= 479px).
 *
 * Mounts on `.nav-mobile-button` (or any ancestor of it, e.g.
 * `.header-nav`). `.mobile_menu` is a SIBLING of the header — both are
 * direct children of body — so the panel is looked up on document.
 *
 * Webflow authors every closed state: the panel's clip-path, the
 * `overflow: clip` masks on each link wrap, and the Close label's
 * translateY(110%). This file only drives them.
 *
 * One paused timeline played/reversed — not two tween sets — so tapping
 * Close mid-open retreats from the current position instead of snapping.
 */
export default function mobileMenu(el) {
	const button = el.matches('.nav-mobile-button')
		? el
		: el.querySelector('.nav-mobile-button');
	const menu = document.querySelector('.mobile_menu');
	if (!button || !menu) return;

	const backdrop = menu.querySelector('.mobile_menu_backdrop');
	const panel = menu.querySelector('.mobile_menu_container');
	const visual = menu.querySelector('.mobile_menu_visual');
	const txts = menu.querySelectorAll('.mobile_menu_txt');
	const labelClose = button.querySelector('.nav-link-text.is-close');
	const labelMenu = button.querySelector(
		'.nav-link-text:not(.is-close)',
	);
	if (!backdrop || !panel || !visual || !labelMenu || !labelClose)
		return;
	if (!txts.length) return;

	const reduced = prefersReducedMotion();
	const controller = new AbortController();
	let isOpen = false;

	// Static start states, set once while the menu is still display:none.
	// The timeline below uses `.to()` only, so reverse() lands exactly
	// back on these literals.
	gsap.set(backdrop, { opacity: 0 });
	gsap.set(panel, { clipPath: HIDDEN });
	gsap.set(visual, { clipPath: HIDDEN });
	gsap.set(txts, { yPercent: Y_FROM });
	gsap.set(labelMenu, { yPercent: 0, y: 0 });
	// `y: 0` is load-bearing. Webflow authors `transform: translateY(110%)`
	// on `.is-close`, and GSAP parses that computed matrix into PIXELS
	// (CSSPlugin _parseTransform), leaving yPercent at 0. It then renders
	// `translate(0%, yPercent%) translate(0px, y)` — the two are additive,
	// so without this the label starts at 220% and never returns above 110%,
	// i.e. never escapes the button's `overflow: clip`.
	gsap.set(labelClose, { yPercent: Y_FROM, y: 0 });

	const tl = gsap.timeline({
		paused: true,
		defaults: { ease: 'power3.out' },
	});

	// The panel wipe is the SPINE — every later beat is placed as a
	// percentage of it, so retiming the panel retimes the whole menu.
	// The labels use percent-of-previous syntax, so they are added right
	// here, before any other tween becomes "previous".
	// TRAP: a bare '25%' is NOT a percentage — it creates a label named "25%".
	tl.to(
		panel,
		{
			clipPath: OPEN,
			duration: 1.5,
			ease: 'power4.inOut',
		},
		0,
	);
	tl.addLabel('links', '<45%'); // 25% into the panel wipe
	tl.addLabel('image', '<65%'); // 45% into the panel wipe

	// Dark backdrop fades up with the panel.
	tl.to(
		backdrop,
		{
			opacity: 1,
			duration: 0.4,
			ease: 'none',
		},
		0,
	);

	// Button label swaps Menu -> Close, same instant.
	tl.to(
		labelMenu,
		{
			yPercent: -Y_FROM,
			duration: 0.4,
		},
		0,
	);
	tl.to(
		labelClose,
		{
			yPercent: 0,
			duration: 0.4,
		},
		'<',
	);

	// The five links rise into their masks.
	tl.to(
		txts,
		{
			yPercent: 0,
			duration: 0.7,
			stagger: 0.04,
		},
		'links',
	);

	// Artwork image clips open last.
	tl.to(
		visual,
		{
			clipPath: OPEN,
			duration: 0.7,
		},
		'image',
	);

	tl.eventCallback('onReverseComplete', () => {
		gsap.set(menu, { display: 'none' });
	});

	const setOpen = (next) => {
		if (next === isOpen) return;
		isOpen = next;

		if (next) {
			// Must precede play(): the CSS rule is display:none.
			gsap.set(menu, { display: 'block' });
			SmoothScroll.instance?.stopScroll();
			if (reduced) tl.progress(1).pause();
			else tl.play();
			return;
		}

		SmoothScroll.instance?.startScroll();
		if (reduced) {
			tl.progress(0).pause();
			gsap.set(menu, { display: 'none' });
		} else {
			tl.reverse();
		}
	};

	// GSAP writes an INLINE display:block on `.mobile_menu`, which outranks
	// the stylesheet's display:none — an open menu dragged past 479px would
	// otherwise stay pinned over the desktop layout.
	const mq = window.matchMedia(BREAKPOINT);
	mq.addEventListener(
		'change',
		() => {
			if (mq.matches || !isOpen) return;
			isOpen = false;
			tl.progress(0).pause();
			gsap.set(menu, { display: 'none' });
			SmoothScroll.instance?.startScroll();
		},
		{ signal: controller.signal },
	);

	button.addEventListener('click', () => setOpen(!isOpen), {
		signal: controller.signal,
	});

	onDestroy(() => {
		controller.abort();
		tl.kill();
		if (isOpen) SmoothScroll.instance?.startScroll();
	});
}
