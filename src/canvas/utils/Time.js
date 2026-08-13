import { Emitter } from '@utils/Emitter';
import { addRaf } from '@core/raf';

export default class Time extends Emitter {
	constructor() {
		super();

		this.start = performance.now();
		this.current = this.start;
		this.elapsed = 0;
		this.delta = 16;
		this.playing = true;

		this._removeRaf = addRaf(this._tick.bind(this), 1);
	}

	_tick() {
		const current = performance.now();
		this.delta = current - this.current;
		if (this.delta > 60) this.delta = 60;
		this.elapsed += this.playing ? this.delta : 0;
		this.current = current;

		if (this.playing) {
			this.emit('tick');
		}
	}

	play() {
		this.playing = true;
	}

	pause() {
		this.playing = false;
	}

	stop() {
		this._removeRaf?.();
		this._removeRaf = null;
	}
}
