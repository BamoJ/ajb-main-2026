/**
 * Unified event system — replaces both EventBus (singleton) and EventEmitter (class).
 *
 * Usage as a class (for Time, Page, etc.):
 *   import { Emitter } from '@utils/Emitter';
 *   class Time extends Emitter { ... }
 *   this.emit('tick');
 *
 * Usage as a global singleton (cross-layer signals):
 *   import emitter from '@utils/Emitter';
 *   emitter.on('transition:start', callback);
 *   emitter.emit('transition:start', data);
 *
 * Supports namespace cleanup:
 *   emitter.on('tick', callback, 'myView');
 *   emitter.off('tick', null, 'myView');  // removes only that namespace
 */
export class Emitter {
	constructor() {
		this._events = {};
	}

	on(event, callback, namespace) {
		if (!event || !callback) return this;
		const key = namespace ? `${event}.${namespace}` : event;

		if (!this._events[event]) this._events[event] = [];
		this._events[event].push({ fn: callback, ns: namespace || null });

		return this;
	}

	once(event, callback, namespace) {
		const wrapper = (data) => {
			callback(data);
			this.off(event, wrapper, namespace);
		};
		return this.on(event, wrapper, namespace);
	}

	off(event, callback, namespace) {
		if (!event) return this;

		// Remove by namespace only (no specific callback)
		if (!callback && namespace) {
			if (this._events[event]) {
				this._events[event] = this._events[event].filter(
					(entry) => entry.ns !== namespace,
				);
				if (!this._events[event].length)
					delete this._events[event];
			}
			return this;
		}

		// Remove specific callback
		if (callback && this._events[event]) {
			this._events[event] = this._events[event].filter(
				(entry) => entry.fn !== callback,
			);
			if (!this._events[event].length) delete this._events[event];
			return this;
		}

		// Remove all listeners for event
		delete this._events[event];
		return this;
	}

	emit(event, data) {
		if (!this._events[event]) return this;
		// Snapshot to avoid mutation during iteration
		const entries = [...this._events[event]];
		entries.forEach((entry) => entry.fn(data));
		return this;
	}

	clear() {
		this._events = {};
		return this;
	}
}

// Global singleton for cross-layer communication
export default new Emitter();
