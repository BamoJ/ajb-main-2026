import AnimationCore from '@animations/AnimationCore';
import { SplitText } from 'gsap/SplitText';
import { easings } from '@utils/easings';
import { addResize } from '@core/resize';
export default class ParaReveal extends AnimationCore {
	constructor(element) {
		super(element, {
			triggerStart: 'top 95%',
			duration: 1.25,
			ease: easings.paragraphEase,
		});

		// IMPORTANT: If element has display:contents, use first child as trigger
		const computedStyle = window.getComputedStyle(element);
		if (computedStyle.display === 'contents') {
			this.triggerElement = element.querySelector(
				'p, h1, h2, h3, h4, h5, h6, li, span',
			);
		}
		this.element.originalContent = this.element.innerHTML;
		this.isMobile = window.matchMedia('(max-width: 991px)').matches;

		// Split text immediately
		this.splitText();

		if (!this.isMobile) {
			this._removeResize = addResize(() => {
				if (this.timeline) this.timeline.kill();
				if (this.scrollTrigger) this.scrollTrigger.kill();
				this.element.innerHTML = this.element.originalContent;
				this.splitText();
				// Re-initialize after resize
				this.createTimeline();
				this.animate();
				this.createScrollTrigger();
			}, 1);
		}
	}

	splitText() {
		// Prevent double-splitting by reverting any existing split
		if (this.element._split) {
			this.element._split.revert();
		}

		// Split richtext paragraphs into lines
		const richTextElements = this.element.querySelectorAll(
			'p, h1, h2, h3, h4, h5, h6, li, span',
		);

		// Skip SplitText on mobile
		if (this.isMobile) {
			return;
		}

		if (richTextElements.length > 0) {
			this.element._split = new SplitText(richTextElements, {
				type: 'lines',
				mask: 'lines',
				linesClass: 'lineChildren',
				reduceWhiteSpace: false,
				preserveHTML: true,
			});
		}
	}

	animate() {
		if (this.isMobile) {
			// Mobile: fade-in the children (not the parent which has display:contents)
			const children = this.element.querySelectorAll(
				'p, h1, h2, h3, h4, h5, h6, li, span',
			);
			this.timeline.from(children, {
				opacity: 0,
				duration: 0.85,
				ease: 'sine.out',
			});
			return;
		}

		const lineElements =
			this.element.querySelectorAll('.lineChildren');
		if (lineElements.length === 0) return;

		this.timeline.fromTo(
			lineElements,
			{ yPercent: 100 },
			{
				yPercent: 0,
				duration: this.options.duration,
				ease: this.options.ease,
				stagger: { each: 0.045 },
			},
		);
	}

	destroy() {
		if (this._removeResize) this._removeResize();
		super.destroy();
	}
}
