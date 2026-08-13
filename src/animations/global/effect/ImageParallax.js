import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import AnimationCore from '@animations/AnimationCore';

gsap.registerPlugin(ScrollTrigger);

export default class ImageParallax extends AnimationCore {
	constructor(element) {
		super(element, {
			triggerStart: 'top bottom',
			triggerEnd: 'bottom top',
			scrub: 1,
		});
	}

	animate() {
		gsap.set(this.element, { scale: 1.35 });

		this.timeline.to(this.element, {
			y: this.element.clientHeight * 0.175,
			ease: 'none',
		});
	}
}
