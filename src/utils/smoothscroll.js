import Lenis from 'lenis';
import ScrollTrigger from 'gsap/ScrollTrigger';
import gsap from 'gsap';
import { handleEditor } from '@webflow/detect-editor';
import { addRaf } from '@core/raf';

gsap.registerPlugin(ScrollTrigger);

export default class SmoothScroll {
	static instance;

	constructor(options = {}) {
		if (SmoothScroll.instance) {
			return SmoothScroll.instance;
		}

		this.lenis = new Lenis({
			duration: 1.4,
			easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			smoothWheel: true,
			wheelMultiplier: 1.6,
			syncTouches: true,
			anchors: true,
			autoResize: true,
			touchMultiplier: 1,
			allowNestedScroll: true,
			...options,
		});

		this.lenis.on('scroll', () => {
			ScrollTrigger.update();
		});

		gsap.ticker.lagSmoothing(100, 16);

		addRaf((time) => this.lenis.raf(time), 0);

		handleEditor((isEditor) => {
			if (isEditor) this.stopScroll();
			else this.startScroll();
		});

		SmoothScroll.instance = this;
	}

	stopScroll() {
		this.lenis.stop();
	}

	startScroll() {
		this.lenis.start();
	}

	resize() {
		this.lenis.resize();
	}
}
