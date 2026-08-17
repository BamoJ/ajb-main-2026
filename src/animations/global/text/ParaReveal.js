import AnimationCore from '@animations/AnimationCore';
import { SplitText } from 'gsap/SplitText';
import { easings } from '@utils/easings';
import { addResize } from '@core/resize';

export default class ParaReveal extends AnimationCore {
	constructor(element) {
		super(element, {
			triggerStart: 'top 75%',
			duration: 1.5,
			ease: easings.paragraphEase,
		});

		this.isMobile = window.matchMedia('(max-width: 991px)').matches;

		// Mobile: no split — animate() fades this.element instead.
		if (this.isMobile) return;

		this.splitText();

		this._removeResize = addResize(() => this.resplit(), 1);

		// Fonts load async via WebFont.js — lines measured against fallback
		// metrics re-wrap when the real font swaps in. One-time re-split once
		// pending fonts settle (skipped when already loaded, e.g. SPA nav).
		if (document.fonts.status !== 'loaded') {
			document.fonts.ready.then(() => {
				if (!this._destroyed) this.resplit();
			});
		}
	}

	splitText() {
		this.split = new SplitText(this.element, {
			type: 'lines',
			mask: 'lines',
			linesClass: 'lineChildren',
		});
	}

	resplit() {
		if (this._destroyed) return;
		if (this.timeline) this.timeline.kill();
		if (this.scrollTrigger) this.scrollTrigger.kill();
		this.split.revert();
		this.splitText();

		// Reduced motion: setup() never ran — keep DOM fresh, no animation.
		if (!this._isSetup) return;

		this.createTimeline();
		this.animate();

		if (this._hasPlayed) {
			// once:true trigger already fired — land revealed, don't replay.
			this.timeline.progress(1);
		} else if (this._isActive) {
			this.createScrollTrigger();
		}
	}

	onEnter() {
		this._hasPlayed = true;
	}

	animate() {
		if (this.isMobile) {
			this.timeline.from(this.element, {
				opacity: 0,
				duration: 0.85,
				ease: 'sine.out',
			});
			return;
		}

		if (!this.split || this.split.lines.length === 0) return;

		this.timeline.fromTo(
			this.split.lines,
			{ yPercent: 120 },
			{
				yPercent: 0,
				duration: this.options.duration,
				ease: this.options.ease,
				stagger: { each: 0.045 },
			},
		);
	}

	destroy() {
		this._destroyed = true;
		if (this._removeResize) this._removeResize();
		super.destroy();
	}
}
