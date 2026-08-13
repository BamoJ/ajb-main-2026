/**
 * Centralized, debounced resize subscriptions.
 *
 * Replaces scattered `window.addEventListener('resize')` across Canvas,
 * DOMPlane, etc. Subscribers receive the new {width, height} after a
 * 100 ms debounce; same-size frames (e.g. mobile toolbar show/hide)
 * are filtered out. Lower priority runs first.
 *
 *   const off = addResize(({ width, height }) => { ... }, 0)
 *   off()  // unsubscribe
 */
const subs = [];
let width = window.innerWidth;
let height = window.innerHeight;
let timeout;

window.addEventListener('resize', () => {
	clearTimeout(timeout);
	timeout = setTimeout(() => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		if (w === width && h === height) return;
		width = w;
		height = h;
		for (let i = 0; i < subs.length; i++) {
			subs[i].fn({ width, height });
		}
	}, 100);
});

export function addResize(fn, priority = 0) {
	const sub = { fn, priority };
	subs.push(sub);
	subs.sort((a, b) => a.priority - b.priority);
	return () => {
		const i = subs.indexOf(sub);
		if (i !== -1) subs.splice(i, 1);
	};
}

export function getViewport() {
	return { width, height };
}
