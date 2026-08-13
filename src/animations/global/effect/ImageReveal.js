import AnimationCore from '@animations/AnimationCore';
import { easings } from '@utils/easings';

export default class ImageReveal extends AnimationCore {
	constructor(element) {
		super(element, {
			duration: 1.7,
			ease: easings.revealEase,
		});
	}

	animate() {
		this.element.style.transformOrigin = 'right center';
		this.timeline.to(
			this.element,
			{
				scaleX: 0,
				duration: this.options.duration,
				ease: this.options.ease,
			},
			'<',
		);
	}
}
