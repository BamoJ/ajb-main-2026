import { Core } from '@unseenco/taxi';
import SmoothScroll from '@utils/smoothscroll';
import Components from '@components';
import emitter from '@utils/Emitter';
import GlobalTransition from './global/GlobalEnter';
import Animation from '@animations';
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
 *     page transition composes its timeline (flight handles + DOM)
 *     canvas.onChange → WebGL page swap (parallel to DOM transition)
 *     …timeline completes → remove old views → resetWebflow →
 *     re-discover components/animations → activate → startScroll →
 *     await runPageIn() → emit transition:complete
 */
export default class TransitionManager {
	constructor({ canvas = null, pageTransitions = {} } = {}) {
		this.scroll = new SmoothScroll();
		// main.js constructs the Canvas itself (or passes null on no-WebGL
		// pages). No fallback construction here — importing Canvas would drag
		// Three.js into DOM-only bundles.
		this.canvas = canvas;
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
		this.animation.activate();
		// Taxi transitions never run on a hard load — give the current page's
		// transition class one shot at its enter choreography on boot.
		this.pageTransitions[this.detectPageName()]?.initialEnter?.(
			document.querySelector('[data-taxi-view]'),
		);
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

				// Expose the WebGL controller so page transitions can compose
				// flight handles onto their timeline (see ProjectTrans).
				this.transitionController =
					manager.canvas?.transitionController || null;

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
						manager.animation?.destroy?.();
						manager.component = new Components();
						manager.animation = new Animation();
						// setup() is done by Animation constructor.
						// activate() runs once page is ready (no scroll race).
						manager.animation.activate();

						scrollInstance.startScroll();

						await runPageIn();
						runMount();

						emitter.emit('transition:complete');
					} catch (err) {
						console.error('[TransitionManager] onEnter failed:', err);
					} finally {
						// Defensive: if a flight was prepared but no page
						// transition consumed the staged mesh (no per-page
						// Transition registered, no [data-gl-target], or
						// the page transition threw), this catches the orphan.
						// No-op when the flight already cleaned itself up.
						manager.canvas?.transitionController?.cleanup?.();
						done();
					}
				});

				// Trigger WebGL page swap (parallel to DOM transition). If a
				// mesh was staged via `webgl:transition:prepare`, the per-page
				// transition class (e.g. ProjectTrans) calls
				// `transitionController.getFlightContext(rect)` synchronously
				// to grab the mesh + helpers and authors the unified timeline.
				if (manager.canvas) {
					const pageName = manager.detectPageName(to);
					// Hand the OUTGOING WebGL page the link that was clicked so
					// its transitionOut can branch on it. Taxi gives us the
					// clicked <a> as `trigger`; null on popstate/programmatic.
					if (manager.canvas.currentPage) {
						manager.canvas.currentPage.leaveTrigger = trigger;
					}
					// Always tell the canvas: leaving to a non-WebGL page
					// (null / unregistered name) runs the current page's
					// onLeave so its exit choreography still plays.
					manager.canvas.onChange(pageName, to);
				}
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
				// Dispatch on the detected page name — the same detector
				// canvas.onChange uses — not a substring path match. A raw
				// `path.includes('home')` never matches "/", and
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
		const pageAttr =
			pageElement.dataset.page ||
			pageElement.dataset.canvasPage ||
			pageElement.querySelector('[data-page]')?.dataset.page;

		if (pageAttr) return pageAttr;

		// URL fallback — exact path-segment match. Substring `.includes()`
		// would falsely match `/home-services` against `home`, or
		// `/projects-archive` against `project`.
		if (!this.canvas) return null;

		const segments = window.location.pathname
			.split('/')
			.filter(Boolean);

		for (const key of Object.keys(this.canvas.registry)) {
			if (
				segments.length === 0 &&
				(key === 'home' || key === 'index')
			) {
				return key;
			}
			if (segments.includes(key)) return key;
		}
		return null;
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
