import { Transition } from '@unseenco/taxi';
import { gsap } from 'gsap';
import { prefersReducedMotion } from '@utils/media';

// ── Tweak the page crossfade here ────────────────────────────────
// Incoming (new) and outgoing (old) views are tuned separately.
const IN_DELAY = 0.3; // pause before the new view fades in (s)
const IN_DURATION = 1; // new view fade-in length (s)
const IN_EASE = 'power1.out';
// If a WebGL page fades its meshes on leave, keep the DOM fade matched to it
// (same start, duration, ease) — otherwise the WebGL clears first and the DOM
// sits blank / flashes raw hidden images in the gap.
const OUT_DELAY = 0;
const OUT_DURATION = 0.5; // old view fade-out length (s)
const OUT_EASE = 'sine.inOut';
// ─────────────────────────────────────────────────────────────────

/**
 * GlobalTransition — the base/default page transition: the incoming view
 * fades in while the outgoing view(s) fade out, on one timeline. Used
 * directly for any page without a specific transition; per-page transitions
 * (e.g. ProjectTrans) extend this or replace it and add hero reveals.
 *
 * Per-page pacing: a subclass may set `inDelay` / `inDuration` / `outDelay` /
 * `outDuration` instance fields to override the constants above, and override
 * `composeEnter(to, tl)` to add reveals to the live timeline.
 */
export default class GlobalTransition extends Transition {
	onLeave({ from, trigger, done }) {
		done();
	}

	onEnter({ to, trigger }, animationComplete) {
		let resolved = false;
		const finish = () => {
			if (resolved) return;
			resolved = true;
			gsap.set(to, { clearProps: 'all' }); // drop the inline opacity we set
			animationComplete();
		};
		// `finish` triggers the view sweep (removes the OUTGOING view) +
		// scrollTo, so it must wait for the OUTGOING fade too — else the old
		// page is removed mid-fade and cuts instead of easing. Gate on both
		// fades; long per-page hero reveals do NOT gate it (separate tweens).
		let pending = 1; // incoming always animates
		const done = () => {
			if (--pending <= 0) finish();
		};

		// Outgoing view(s) read from the live DOM — a cached ref can go stale
		// under Taxi's `removeOldContent: false` and leave the old page stuck.
		const outgoing = [
			...document.querySelectorAll('[data-taxi-view]'),
		].filter((v) => v !== to);

		// Reduced motion: no crossfade — snap states and resolve immediately.
		if (prefersReducedMotion()) {
			gsap.set(to, { opacity: 1 });
			if (outgoing.length) gsap.set(outgoing, { opacity: 0 });
			finish();
			return;
		}

		// Incoming transparent first (no first-frame flash), then crossfade
		// both on one timeline. `finish` fires from the tweens' onComplete
		// (not the timeline's), so reveals added via composeEnter don't hold
		// up the page re-init.
		gsap.set(to, { opacity: 0 });
		const tl = gsap.timeline();
		const inDelay = this.inDelay ?? IN_DELAY;
		const inDuration = this.inDuration ?? IN_DURATION;
		tl.to(
			to,
			{
				opacity: 1,
				duration: inDuration,
				ease: IN_EASE,
				delay: inDelay,
				onComplete: done,
			},
			0,
		);
		if (outgoing.length) {
			// The outgoing view eases fully to 0 BEFORE the sweep removes it
			// (done() waits for this tween too) — no mid-fade cut.
			pending++;
			tl.to(
				outgoing,
				{
					opacity: 0,
					duration: this.outDuration ?? OUT_DURATION,
					ease: OUT_EASE,
					onComplete: done,
				},
				this.outDelay ?? OUT_DELAY,
			);
		}

		// Per-page seam: compose hero reveals onto the live timeline. No-op
		// by default. Must NOT be named `enter`/`leave` — Taxi's Transition
		// base owns those (the Promise-returning methods it calls).
		this.composeEnter(to, tl);

		// Safety backstop only — derived from the ACTUAL pacing so it can
		// never beat the real fade (a hardcoded timeout that fires before the
		// fade ends would clearProps-snap the view in with no fade).
		setTimeout(finish, (inDelay + inDuration) * 1000 + 500);
	}

	/**
	 * Override in a per-page transition to compose that page's hero reveals
	 * onto the crossfade timeline `tl`. Animate transform/opacity only;
	 * pre-split text before revealing.
	 */
	composeEnter(to, tl) {}
}
