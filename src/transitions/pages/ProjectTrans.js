/**
 * ProjectTransition — REFERENCE / PLACEHOLDER (not active by default).
 *
 * To enable, in src/main.js:
 *   import ProjectTransition from './transitions/pages/ProjectTrans';
 *   const pageTransitions = { project: ProjectTransition };
 *
 * Authors mesh + shader + DOM choreography on a single GSAP timeline.
 * Every duration, ease, label, and stagger is visible top-to-bottom in
 * this file. Change `FLIGHT` and every beat rescales.
 *
 * Position grammar (GSAP-native, no math constants):
 *   The flight-duration spine tween is added first; the labels are defined
 *   immediately after it with percent-of-previous-tween syntax —
 *   '<35%' = spine start + 35% of its duration, '>-20%' = spine end − 20%.
 *   NOTE: a bare '35%' position is NOT a percentage — GSAP would create a
 *   label literally named "35%" at the timeline's current end. Only the
 *   '<'/'>'-prefixed forms are percentages.
 *
 * Strip / duplicate / rename per project. Delete if you don't need it.
 *
 * Required Webflow markup on the destination project page:
 *   <element data-gl-target>             -- where the mesh should land
 *   <element data-project="heading">     -- SplitText chars reveal
 *   <element data-project="small-text">  -- block reveal
 *   <element data-project="para">        -- SplitText lines reveal
 */
import { Transition } from '@unseenco/taxi';
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { prefersReducedMotion } from '@utils/media';

gsap.registerPlugin(SplitText);

// Single source of truth for the flight duration. The labels below
// ('reveal', 'detail', 'handoff') all reposition automatically.
const FLIGHT = 1.5;

export default class ProjectTransition extends Transition {
	/**
	 * Hard-load seam: Taxi transitions never run on a direct page load.
	 * TransitionManager calls this once at boot with the initial
	 * [data-taxi-view] — put the page's first-load enter choreography here.
	 */
	static initialEnter(view) {}

	onLeave({ done }) {
		done();
	}

	onEnter({ to, trigger }, animationComplete) {
		// Outgoing view(s) read from the live DOM (TransitionManager no
		// longer caches a fromElement — a cached ref can go stale under
		// Taxi's `removeOldContent: false`).
		const outgoing = [
			...document.querySelectorAll('[data-taxi-view]'),
		].filter((v) => v !== to);

		if (prefersReducedMotion()) {
			if (outgoing.length) gsap.set(outgoing, { opacity: 0 });
			animationComplete();
			return;
		}

		// ---- DOM queries ----
		const headings = to.querySelectorAll('[data-project="heading"]');
		const smallTexts = to.querySelectorAll(
			'[data-project="small-text"]',
		);
		const paragraphs = to.querySelectorAll('[data-project="para"]');

		const splitHeadings = headings.length
			? new SplitText(headings, { type: 'chars, lines' })
			: null;
		const splitParas = paragraphs.length
			? new SplitText(paragraphs, { type: 'lines' })
			: null;

		// ---- Flight context — present only if a mesh was staged on click ----
		const targetEl = to.querySelector('[data-gl-target]');
		const ctx =
			this.transitionController && targetEl
				? this.transitionController.getFlightContext(
						targetEl.getBoundingClientRect(),
					)
				: null;

		// ---- One timeline. Everything below runs in chronological order. ----
		const tl = gsap.timeline({
			onComplete: () => {
				ctx?.cleanup();
				animationComplete();
			},
		});

		// Always: fade out the old page
		if (outgoing.length) {
			tl.to(
				outgoing,
				{ opacity: 0, duration: 0.4, ease: 'sine.out' },
				0,
			);
		}

		// The flight-duration SPINE — exists with or without a mesh so the
		// labels below resolve identically either way. The labels use
		// percent-of-previous syntax, so they must be added right here,
		// before any other tween replaces "previous".
		tl.to({}, { duration: FLIGHT }, 0);
		tl.addLabel('reveal', '<35%'); //  35% into the flight
		tl.addLabel('detail', '<45%'); //  45% into the flight
		tl.addLabel('handoff', '>-20%'); // last 20% of the flight

		// ---- Mesh + shader (only when a flight was prepared) ----
		if (ctx) {
			const u = ctx.uniforms;

			// Mesh fly to target rect
			tl.to(
				ctx.mesh.position,
				{
					x: ctx.world.x,
					y: ctx.world.y,
					duration: FLIGHT,
					ease: 'expo.inOut',
				},
				0,
			);

			// Geometry resize + UV correction (plane-specific)
			tl.to(
				ctx.sizeProxy,
				{
					width: ctx.world.width,
					height: ctx.world.height,
					progress: 1,
					duration: FLIGHT,
					ease: 'expo.inOut',
					onUpdate: ctx.onSizeUpdate,
				},
				0,
			);

			// Shader effect — paper ripple + perlin displacement
			tl.to(
				u.uPageTransition,
				{ value: 1, duration: FLIGHT, ease: 'power1.inOut' },
				0,
			);

			// Shader handoff fade — WebGL plane gives way to the HTML image
			tl.to(
				u.uOpacity,
				{ value: 0, duration: FLIGHT * 0.2, ease: 'power2.inOut' },
				'handoff',
			);
		}

		// ---- DOM reveals (always run; same labels work flight-or-not) ----
		if (splitHeadings) {
			tl.from(
				splitHeadings.chars,
				{
					yPercent: 100,
					duration: 1.32,
					ease: 'power4.out',
					stagger: 0.05,
				},
				'reveal',
			);
		}
		if (smallTexts.length) {
			tl.from(
				smallTexts,
				{
					yPercent: 100,
					duration: 1.1,
					ease: 'power3.out',
					stagger: 0.05,
				},
				'detail',
			);
		}
		if (splitParas) {
			tl.from(
				splitParas.lines,
				{
					yPercent: 100,
					duration: 1.1,
					ease: 'power3.out',
					stagger: 0.05,
				},
				'handoff',
			);
		}
	}
}
