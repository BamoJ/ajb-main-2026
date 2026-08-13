import '@styles/index.css';
import { initCore } from '@core/boot';
import TransitionManager from '@transitions';

// --- Transition Registry ---
// Import page-specific transitions (optional).
// Pages without a transition use GlobalEnter by default.
// import ProjectTransition from './transitions/pages/ProjectTrans';

const pageTransitions = {
	// project: ProjectTransition,
	// about: AboutTransition,
};

// --- App ---
// DOM-only wiring: no Preloader, no WebGL (`canvas: null`).
// To enable WebGL, construct the Canvas here and pass it in:
//   import Canvas from '@canvas';
//   import { Home } from '@canvas/Home';
//   const canvas = document.querySelector('.canvas')
//   	? new Canvas({ home: Home })
//   	: null;
//   new TransitionManager({ canvas, pageTransitions });
class App {
	constructor() {
		initCore();
		new TransitionManager({ canvas: null, pageTransitions });
	}
}

window.Webflow ||= [];
window.Webflow.push(() => {
	new App();
});
