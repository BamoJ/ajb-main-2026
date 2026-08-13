import AnimationCore from '@animations/AnimationCore';

export default class FadeIn extends AnimationCore {
	constructor(element) {
		// Pass element and options to base Animation class
		super(element, {
			duration: 1.5,
			ease: 'sine.out',
		});
	}

	animate() {
		// Create animation
		this.timeline.from(this.element, {
			autoAlpha: 0,
			duration: this.options.duration,
			ease: this.options.ease,
		});
	}
}
