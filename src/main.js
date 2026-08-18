import '@styles/index.css';
import { initCore } from '@core/boot';
import TransitionManager from '@transitions';
import Preloader from '@transitions/Preloader';

// --- Transition Registry ---
// Every page gets GlobalEnter's crossfade + the shared hero enter
// (heroEnter.js) by default. Register a per-page class here only when a
// page truly needs its own choreography.
const pageTransitions = {};

window.Webflow ||= [];
window.Webflow.push(() => {
	const scroll = initCore();

	// Hard-load loader — only when Webflow has authored the overlay.
	// Without it, boot immediately: waiting on the image preload with no
	// covering overlay would leave the raw page visible for seconds.
	if (document.querySelector('[data-loader="wrapper"]')) {
		let manager;
		scroll.stopScroll(); // no scrolling behind the overlay
		new Preloader({
			onAppStart: () => {
				// Runs behind the still-opaque overlay: Taxi cache seed,
				// component mount, animation setup (hidden states), and the
				// paused hard-load hero timeline all land invisibly.
				manager = new TransitionManager({
					pageTransitions,
					deferInitial: true,
				});
			},
			// Fires after the overlay has fully faded out: arm
			// ScrollTriggers, start scroll, play the hero enter.
			onComplete: () => manager.initialEnter(),
		})
			.start()
			.catch((err) => {
				// Never leave the site bricked behind the overlay.
				console.error('[Preloader] boot failed:', err);
				const wrapper = document.querySelector(
					'[data-loader="wrapper"]',
				);
				if (wrapper) wrapper.style.visibility = 'hidden';
				scroll.startScroll();
				manager?.initialEnter();
			});
	} else {
		new TransitionManager({ pageTransitions });
	}
});
