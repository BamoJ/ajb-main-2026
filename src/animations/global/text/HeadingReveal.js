import AnimationCore from '@animations/AnimationCore';
import { SplitText } from 'gsap/SplitText';
import { easings } from '@utils/easings';

export default class HeadingReveal extends AnimationCore {
	constructor(element) {
		super(element, {
			triggerStart: 'top 95%',
			duration: 1,
			ease: easings.heading,
		});

		this.split = new SplitText(this.element, {
			type: 'chars',
			mask: 'chars',
		});

		// text-indent is inherited + percentage-based, so SplitText's nested
		// mask/char spans re-resolve it against their own width and clip the
		// glyph. Zero it on the generated nodes; the heading keeps its indent
		// so the first line stays offset (value stays owned by Webflow CSS).
		[this.split.masks, this.split.chars, this.split.words]
			.flat()
			.filter(Boolean)
			.forEach((el) => (el.style.textIndent = '0px'));

		// IMPORTANT: If element has display:contents, use first child as trigger
		const computedStyle = window.getComputedStyle(element);
		if (computedStyle.display === 'contents') {
			this.triggerElement = element.querySelector(
				'p, h1, h2, h3, h4, h5, h6',
			);
		}
	}

	animate() {
		// Create animation
		this.timeline.from(this.split.chars, {
			yPercent: 100,
			stagger: {
				amount: 0.4,
				grid: [10, 1],
				axis: 'y',
				from: 'start',
			},
			duration: this.options.duration,
			ease: this.options.ease,
		});
	}
}
