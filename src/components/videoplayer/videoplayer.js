import { onDestroy } from '@core/hooks';
import { prefersReducedMotion } from '@utils/media';
import { MainPlayer } from './variants/MainPlayer.js';
import { LightboxPlayer } from './variants/LightboxPlayer.js';
import { BackgroundPlayer } from './variants/BackgroundPlayer.js';

/**
 * videoplayer — auto-discovered factory for [data-component="videoplayer"].
 *
 * Reads `data-video` to dispatch to the correct variant:
 *   data-video="main"      → MainPlayer (full-featured inline player)
 *   data-video="lightbox"  → LightboxPlayer (modal/popup)
 *   data-video="bg"        → BackgroundPlayer (autoplay loop)
 *
 * Lightbox open/close/ESC routing is centralized at the document level.
 * The first lightbox instance installs the listeners; the last one to
 * destroy uninstalls them. Across Taxi page transitions, the routing
 * tears down with the page and reinstalls with the next.
 *
 * Background variant skips instantiation under `prefers-reduced-motion`.
 */

const VARIANTS = {
	main: MainPlayer,
	lightbox: LightboxPlayer,
	bg: BackgroundPlayer,
};

// ─── Centralized lightbox routing (module-level) ─────────────────────

const lightboxes = [];
let docAbortController = null;

function installLightboxRouting() {
	if (docAbortController) return;
	docAbortController = new AbortController();
	const { signal } = docAbortController;

	document.addEventListener(
		'click',
		(e) => {
			// Close button — accepts both video- and bunny- aliases
			const closeBtn = e.target.closest(
				'[data-video-lightbox-control="close"], [data-bunny-lightbox-control="close"]',
			);
			if (closeBtn) {
				const closeWrapper = closeBtn.closest(
					'[data-video-lightbox-status]',
				);
				if (closeWrapper) {
					const lb = lightboxes.find(
						(l) => l.wrapper === closeWrapper,
					);
					if (lb) lb.close();
				}
				return;
			}

			// Open button — accepts both video- and bunny- aliases
			const openBtn = e.target.closest(
				'[data-video-lightbox-control="open"], [data-bunny-lightbox-control="open"]',
			);
			if (openBtn) {
				const src =
					openBtn.getAttribute('data-video-lightbox-src') ||
					openBtn.getAttribute('data-bunny-lightbox-src') ||
					'';
				if (!src) return;
				const imgEl =
					openBtn.querySelector(
						'[data-video-lightbox-placeholder]',
					) ||
					openBtn.querySelector(
						'[data-bunny-lightbox-placeholder]',
					);
				const placeholderUrl = imgEl ? imgEl.getAttribute('src') : '';

				const target = findLightboxForOpenBtn(openBtn);
				if (target) {
					// Close any other active lightbox first
					lightboxes.forEach((lb) => {
						if (lb !== target && lb._isActive()) lb.close();
					});
					target.open(src, placeholderUrl);
				}
			}
		},
		{ signal },
	);

	document.addEventListener(
		'keydown',
		(e) => {
			if (e.key !== 'Escape') return;
			lightboxes.forEach((lb) => {
				if (lb._isActive()) lb.close();
			});
		},
		{ signal },
	);
}

function uninstallLightboxRouting() {
	docAbortController?.abort();
	docAbortController = null;
}

function findLightboxForOpenBtn(openBtn) {
	if (lightboxes.length === 1) return lightboxes[0];

	let node = openBtn.parentElement;
	while (node && node !== document.body) {
		const wrapper = node.querySelector('[data-video-lightbox-status]');
		if (wrapper) {
			const match = lightboxes.find((l) => l.wrapper === wrapper);
			if (match) return match;
		}
		node = node.parentElement;
	}
	return lightboxes[0];
}

// ─── Discovery factory ───────────────────────────────────────────────

export default function videoplayer(el) {
	if (el._videoPlayer) return; // double-init guard

	const variant = el.getAttribute('data-video') || 'main';
	const Ctor = VARIANTS[variant];
	if (!Ctor) {
		console.warn(
			`[videoplayer] Unknown variant "${variant}" — expected one of: ${Object.keys(VARIANTS).join(', ')}`,
			el,
		);
		return;
	}

	// Background autoplay loops violate prefers-reduced-motion — skip entirely.
	// Main and Lightbox are user-initiated, so they always instantiate.
	if (variant === 'bg' && prefersReducedMotion()) return;

	const instance = new Ctor(el);
	el._videoPlayer = instance;

	if (variant === 'lightbox') {
		lightboxes.push(instance);
		installLightboxRouting();
	}

	onDestroy(() => {
		instance.destroy?.();
		el._videoPlayer = null;

		if (variant === 'lightbox') {
			const idx = lightboxes.indexOf(instance);
			if (idx !== -1) lightboxes.splice(idx, 1);
			if (lightboxes.length === 0) uninstallLightboxRouting();
		}
	});
}
