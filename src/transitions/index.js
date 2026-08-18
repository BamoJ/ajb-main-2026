import { Core } from '@unseenco/taxi';
import { gsap } from 'gsap';
import SmoothScroll from '@utils/smoothscroll';
import Components from '@components';
import emitter from '@utils/Emitter';
import GlobalTransition, { composeHeroEnter } from './global/GlobalEnter';
import Animation from '@animations';
import { prefersReducedMotion } from '@utils/media';
import { resetWebflow } from '@webflow/reset-webflow';
import { initTheme, switchThemeFromEntry } from '@utils/theme';
import { updateActiveNav } from '@utils/nav';
import {
	runMount,
	runDestroy,
	runPageIn,
	runPageOut,
} from '@core/hooks';

/**
 * TransitionManager — orchestrates page routing via Taxi.
 *
 * Per-navigation lifecycle:
 *
 *   onLeave:
 *     stopScroll → await runPageOut() → runDestroy() (auto cleanup)
 *
 *   onEnter:
 *     incoming view hidden + its animations set up (pre-fade, invisible) →
 *     transition composes its timeline (crossfade + shared hero enter) →
 *     …fade completes → remove old views → resetWebflow →
 *     re-discover components → activate animations → startScroll →
 *     await runPageIn() → emit transition:complete
 */
export default class TransitionManager {
	constructor({ pageTransitions = {}, deferInitial = false } = {}) {
		this.scroll = new SmoothScroll();
		initTheme(); // prime current theme from the live <body>
		updateActiveNav(); // underline the nav link for the initial page
		this.pageTransitions = pageTransitions;
		// Taxi MUST init before Components/Animation. Its Core constructor
		// snapshots the entry page (document.cloneNode) into its page cache.
		// Components + Animation SplitText-split the live DOM — if they ran
		// first, that split markup gets baked into the cache, and every SPA
		// return re-splits the already-split HTML → nested masks (broken
		// line-heights). Seed the cache from the pristine DOM first.
		this.init();
		this.component = new Components();
		this.animation = new Animation();
		// Built paused at construction: building it applies the hero hidden
		// states immediately (from()'s immediateRender) — invisibly behind
		// the loader on preloaded boots. main.js passes `deferInitial` and
		// calls initialEnter() at loader fade-out; plain boots run it here.
		this.initialTl = this._buildInitialEnter();
		if (!deferInitial) this.initialEnter();
	}

	/**
	 * Hard-load enter choreography. Taxi transitions never run on a hard
	 * load, so the shared hero enter is composed here instead of via
	 * GlobalEnter.composeEnter.
	 */
	_buildInitialEnter() {
		const view = document.querySelector('[data-taxi-view]');
		if (!view) return null;
		// Per-page hard-load seam (registry usually empty — kept for pages
		// that later earn their own transition class).
		this.pageTransitions[this.detectPageName(view)]?.initialEnter?.(
			view,
		);
		if (prefersReducedMotion()) return null;
		const tl = gsap.timeline({ paused: true });
		composeHeroEnter(view, tl);
		return tl;
	}

	/**
	 * Arm ScrollTriggers and play the hard-load hero enter. Runs from the
	 * constructor on plain boots; deferred to the loader's fade-out when
	 * main.js passes `deferInitial` (so in-viewport data-anim reveals don't
	 * fire invisibly behind the overlay).
	 */
	initialEnter() {
		this.animation.activate();
		this.scroll.startScroll();
		this.initialTl?.play();
		this.initialTl = null;
	}

	createTransitions(TransitionClass) {
		const scrollInstance = this.scroll;
		const manager = this;

		return class extends TransitionClass {
			async onLeave({ from, trigger, done }) {
				scrollInstance.stopScroll();
				emitter.emit('transition:start');

				await runPageOut();
				runDestroy();

				super.onLeave({ from, trigger, done });
			}

			onEnter({ to, trigger, done }) {
				to.classList.add('is-transition');
				// Build the incoming page's animations NOW, while it cannot
				// be seen: GlobalEnter fades `to` in from opacity 0, so
				// setup()'s SplitText + from()-state hidden sets land
				// invisibly. The old order (re-init after the fade) painted
				// the new page fully visible, snapped it hidden, then
				// replayed the reveals. Cache-safe: Taxi caches fetched pages
				// from the fetched HTML string (Renderer._contentString),
				// never the live DOM. Scoped to `to` so the OLD page's
				// instances keep animating through the fade.
				gsap.set(to, { opacity: 0 });
				manager.pendingAnimation = new Animation(to);

				super.onEnter({ to, trigger }, async () => {
					try {
						// Authoritative teardown: remove every view except the
						// incoming one. A cached `fromElement` can desync from
						// what's actually rendered under Taxi's
						// `removeOldContent: false` — sweeping the live DOM
						// can't miss it.
						document
							.querySelectorAll('[data-taxi-view]')
							.forEach((view) => {
								if (view !== to) view.remove();
							});

						to.classList.remove('is-transition');
						window.scrollTo(0, 0);
						// Recalc Lenis against the incoming page height so a
						// short page drops the previous tall page's cached
						// scroll extent.
						scrollInstance.resize();

						// Yield one frame before the heavy re-init burst so the
						// transition's final frames paint (the burst otherwise
						// lands mid-crossfade → a visible freeze).
						await new Promise(requestAnimationFrame);

						resetWebflow();

						manager.component?.destroy?.();
						// Old page's instances only — its views are already
						// swept, so the reverts are invisible.
						manager.animation?.destroy?.();
						manager.component = new Components();
						// The incoming page's animations were set up pre-fade
						// (see above); ScrollTriggers arm only now — after
						// scrollTo(0,0) + resize, no scroll race.
						manager.animation = manager.pendingAnimation;
						manager.pendingAnimation = null;
						manager.animation.activate();

						scrollInstance.startScroll();

						await runPageIn();
						runMount();

						emitter.emit('transition:complete');
					} catch (err) {
						console.error('[TransitionManager] onEnter failed:', err);
					} finally {
						done();
					}
				});
			}
		};
	}

	createRoute() {
		const manager = this;
		const Global = this.createTransitions(GlobalTransition);
		const wrappedTransitions = {};

		for (const [name, TransClass] of Object.entries(
			this.pageTransitions,
		)) {
			wrappedTransitions[name] = this.createTransitions(TransClass);
		}

		return class extends Global {
			constructor(options) {
				super(options);
				this.specificTransitions = {};
				for (const [name, WrappedClass] of Object.entries(
					wrappedTransitions,
				)) {
					this.specificTransitions[name] = new WrappedClass(options);
				}
			}

			onEnter(args, done) {
				// Dispatch on the detected page name, not a substring path
				// match. A raw `path.includes('home')` never matches "/", and
				// `/projects-archive` would false-match `project`.
				const name = manager.detectPageName(args.to);
				const trans = name ? this.specificTransitions[name] : null;
				if (trans) {
					trans.onEnter(args, done);
					return;
				}
				super.onEnter(args, done);
			}
		};
	}

	detectPageName(pageElement = document.body) {
		return (
			pageElement.dataset.page ||
			pageElement.querySelector('[data-page]')?.dataset.page ||
			null
		);
	}

	init() {
		// Taxi requires a [data-taxi-view] container in the DOM. If the page
		// doesn't have one (e.g. bare testing page), skip Taxi entirely —
		// animations + components already discovered in the constructor will
		// still work for the initial page; cross-page navigation just won't.
		if (!document.querySelector('[data-taxi-view]')) {
			console.warn(
				'[TransitionManager] No [data-taxi-view] element found — skipping Taxi init. SPA navigation disabled.',
			);
			return;
		}

		// `default` is the only Taxi transition we register. The route class
		// it returns dispatches to per-page transitions internally via
		// detectPageName — no separate top-level registration needed.
		this.taxi = new Core({
			links:
				'a:not([target]):not([href^=\\#]):not([data-taxi-ignore])',
			removeOldContent: false,
			// Never merge the incoming page's <head> stylesheets into the live
			// document. Webflow's CDN can serve pages referencing DIFFERENT
			// hashed builds of the same shared CSS (stale page cache after a
			// publish); Taxi would see the unknown href, append the ENTIRE old
			// stylesheet at the end of <body>, and its bare-element defaults
			// (h2{margin-top:20px} etc.) would win the cascade for the rest of
			// the session. All real styling is the entry page's shared CSS +
			// per-view embeds (swapped with content), so cross-page CSS
			// merging is pure risk here.
			reloadCssFilter: false,
			transitions: { default: this.createRoute() },
		});

		// Carry the incoming page's <body> theme across the SPA swap (Taxi
		// never replaces <body>, so without this the theme goes stale on
		// navigation). NAVIGATE_IN fires after the new content is inserted
		// and before the reveal; `to` is the incoming cache entry whose
		// `.page` is the full fetched document.
		this.taxi.on('NAVIGATE_IN', ({ to }) => {
			switchThemeFromEntry(to);
			updateActiveNav(); // Taxi has already pushed the new URL by now
		});
	}
}
