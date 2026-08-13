/**
 * Lifecycle hooks. Modules register callbacks; the transition layer runs them.
 *
 * Sync hooks (onMount/onDestroy):
 *   onMount(fn)    — fires once after a page is set up
 *   onDestroy(fn)  — fires once before a page is torn down
 *
 * Async hooks (onPageIn/onPageOut):
 *   onPageIn(asyncFn)   — page entrance animation
 *   onPageOut(asyncFn, { element }?) — page exit animation; if `element` is
 *     passed, the callback only runs when the element is in the viewport
 *     (skips off-screen exit anims to save frames during transitions)
 */

const mount = [];
const destroy = [];
const pageIn = [];
const pageOut = [];

export function onMount(fn) {
	mount.push(fn);
}

export function onDestroy(fn) {
	destroy.push(fn);
}

export function onPageIn(fn) {
	pageIn.push(fn);
}

export function onPageOut(fn, { element } = {}) {
	if (element) {
		pageOut.push(async () => {
			const rect = element.getBoundingClientRect();
			const wh = window.innerHeight;
			const visible = rect.top < wh && rect.bottom > 0;
			return visible ? await fn() : Promise.resolve();
		});
	} else {
		pageOut.push(fn);
	}
}

export function runMount() {
	mount.forEach((fn) => fn());
	mount.length = 0;
}

export function runDestroy() {
	destroy.forEach((fn) => fn());
	destroy.length = 0;
}

export async function runPageIn() {
	await Promise.allSettled(pageIn.map((fn) => fn()));
	pageIn.length = 0;
}

export async function runPageOut() {
	await Promise.allSettled(pageOut.map((fn) => fn()));
	pageOut.length = 0;
}
