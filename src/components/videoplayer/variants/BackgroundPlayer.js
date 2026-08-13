import { HLSAdapter } from '../core/HLSAdapter.js';
import { safePlay } from '../core/utils.js';

/**
 * BackgroundPlayer — minimal autoplay, muted, looped video.
 *
 * No controls, no timeline, no hover. Uses IntersectionObserver
 * to play/pause based on viewport visibility.
 */
export class BackgroundPlayer {
	constructor(el) {
		this.el = el;
		this.video = el.querySelector('video');
		this._src = el.getAttribute('data-player-src') || '';
		this._adapter = new HLSAdapter(this.video);
		this._attached = false;
		this._io = null;

		this._init();
	}

	_init() {
		var video = this.video;

		// Reset video state
		try {
			video.pause();
		} catch (_) {}
		try {
			video.removeAttribute('src');
			video.load();
		} catch (_) {}

		video.muted = true;
		video.loop = true;
		video.setAttribute('playsinline', '');
		video.setAttribute('webkit-playsinline', '');
		video.playsInline = true;
		if (typeof video.disableRemotePlayback !== 'undefined')
			video.disableRemotePlayback = true;

		// Play when in view, pause when out
		var self = this;
		this._io = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					if (entry.isIntersecting) {
						if (!self._attached) self._attach();
						else safePlay(self.video);
					} else {
						if (!self.video.paused) self.video.pause();
					}
				});
			},
			{ threshold: 0.1 },
		);

		this._io.observe(this.el);
	}

	_attach() {
		this._attached = true;
		var video = this.video;
		this._adapter.attach(this._src, function () {
			safePlay(video);
		});
	}

	destroy() {
		if (this._io) {
			this._io.disconnect();
			this._io = null;
		}
		this._adapter.destroy();
	}
}
