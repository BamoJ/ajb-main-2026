import gsap from 'gsap';
import CustomEase from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

export const easings = {
	revealEase: CustomEase.create(
		'revealEase',
		'M0,0 C0.602,0.01 -0.024,0.995 1,1 ',
	),

	paragraphEase: CustomEase.create(
		'paragraphEase',
		'M0,0 C0.38,0.005 0.1216,1.0005 1,1',
	),

	heading: CustomEase.create(
		'',
		'M0,0 C0.3851,0.0101 0.0884,0.9991 1,1',
	),
};
