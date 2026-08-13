const subs = [];
let rafId = null;

function loop(time) {
	rafId = requestAnimationFrame(loop);
	for (let i = 0; i < subs.length; i++) subs[i].fn(time);
}

function start() {
	if (rafId === null) rafId = requestAnimationFrame(loop);
}

function stop() {
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
}

/**
 * Subscribe to the shared RAF loop.
 * Lower priority runs first (Lenis=0, WebGL=1).
 * Returns an unsubscribe function.
 */
export function addRaf(fn, priority = 0) {
	const sub = { fn, priority };
	subs.push(sub);
	subs.sort((a, b) => a.priority - b.priority);
	start();
	return () => {
		const i = subs.indexOf(sub);
		if (i !== -1) subs.splice(i, 1);
		if (subs.length === 0) stop();
	};
}
