import { onDestroy } from './hooks';

/**
 * Pooled IntersectionObserver manager.
 *
 * Multiple elements that share the same `root` + `rootMargin` are grouped
 * onto a single IntersectionObserver to avoid spawning one observer per
 * element. Reduces overhead when dozens of elements track viewport.
 */
class ObserverManager {
	static instance;

	constructor() {
		this.groups = [];
	}

	static getInstance() {
		if (!ObserverManager.instance) {
			ObserverManager.instance = new ObserverManager();
		}
		return ObserverManager.instance;
	}

	configsMatch(a, b) {
		return a.root === b.root && a.rootMargin === b.rootMargin;
	}

	handleIntersection(entries) {
		entries.forEach((entry) => {
			const group = this.groups.find((g) =>
				g.elements.has(entry.target),
			);
			if (!group) return;

			const data = group.elements.get(entry.target);
			if (!data) return;

			const { isIntersecting, boundingClientRect } = entry;

			let direction = -1;
			if (data.lastDirection !== undefined) {
				direction = isIntersecting
					? boundingClientRect.top > 0
						? 1
						: -1
					: boundingClientRect.top > 0
						? -1
						: 1;
			}
			data.lastDirection = direction;

			if (isIntersecting) {
				data.callbacks.isIn?.({ entry, direction });
				data.callbacks.callback?.({ entry, direction, isIn: true });
				if (data.once) this.removeElement(entry.target);
			} else {
				data.callbacks.isOut?.({ entry, direction });
				data.callbacks.callback?.({ entry, direction, isIn: false });
			}
		});
	}

	addElement(element, config, callbacks) {
		this.removeElement(element);

		let group = this.groups.find((g) =>
			this.configsMatch(g.config, config),
		);

		if (!group) {
			const observer = new IntersectionObserver(
				(entries) => this.handleIntersection(entries),
				{
					root: config.root,
					rootMargin: config.rootMargin,
					threshold: [0],
				},
			);
			group = { config, observer, elements: new Map() };
			this.groups.push(group);
		}

		group.elements.set(element, {
			callbacks,
			once: config.once || false,
			lastDirection: undefined,
		});
		group.observer.observe(element);

		return group;
	}

	removeElement(element) {
		const group = this.groups.find((g) => g.elements.has(element));
		if (!group) return;

		group.observer.unobserve(element);
		group.elements.delete(element);

		if (group.elements.size === 0) {
			group.observer.disconnect();
			this.groups = this.groups.filter((g) => g !== group);
		}
	}
}

/**
 * Base class for "is this element in the viewport?" tracking.
 *
 * Subclass overrides `isIn(data)` / `isOut(data)` for typed handlers, OR
 * pass a single `callback({ entry, direction, isIn })` for both directions.
 */
export class Observe {
	constructor(element, config = {}) {
		this.element = element;
		this._config = {
			root: null,
			rootMargin: '0px',
			threshold: 0,
			autoStart: false,
			once: false,
			callback: undefined,
			...config,
		};
		this.inView = false;
		this.callback = this._config.callback || (() => {});

		if (this._config.autoStart) this.start();
	}

	start() {
		this._group = ObserverManager.getInstance().addElement(
			this.element,
			this._config,
			{
				isIn: (data) => {
					this.inView = true;
					this.isIn?.(data);
				},
				isOut: (data) => {
					this.inView = false;
					this.isOut?.(data);
				},
				callback: this.callback,
			},
		);
	}

	stop() {
		ObserverManager.getInstance().removeElement(this.element);
	}

	isIn() {}
	isOut() {}

	destroy() {
		this.stop();
	}
}

/**
 * Convenience: create an `Observe` and auto-clean up via `onDestroy`.
 */
export function onView(element, config = {}) {
	const observer = new Observe(element, config);
	onDestroy(() => observer.destroy());
	return observer;
}
