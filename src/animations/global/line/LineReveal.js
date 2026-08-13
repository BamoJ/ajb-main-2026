import AnimationCore from '@animations/AnimationCore';
import { easings } from '@utils/easings';
import { gsap } from 'gsap';

export default class LineReveal extends AnimationCore {
	constructor(element) {
		super(element, {
			duration: 1.7,
			ease: easings.revealEase,
		});
	}

	animate() {
		gsap.set(this.element, { transformOrigin: '0% 50%' });
		this.timeline.from(
			this.element,
			{
				scaleX: '0%',
				duration: this.options.duration,
				ease: this.options.ease,
			},
			'<',
		);
	}
}
