import { PlayerCore } from '../core/PlayerCore.js';
import { HLSAdapter } from '../core/HLSAdapter.js';
import {
	safePlay,
	readyIfIdle,
	setBeforeRatio,
	setText,
	formatTime,
	bestLevel,
} from '../core/utils.js';

/**
 * MainPlayer — full-featured inline player.
 *
 * Adds on top of PlayerCore:
 *  - data-player-src reading at init
 *  - Lazy loading modes (data-player-lazy: "true" | "meta" | eager)
 *  - IntersectionObserver autoplay (data-player-autoplay)
 *  - Hooks lazy-attach into first play
 */
export class MainPlayer {
	constructor(el) {
		this.el = el;
		this.core = new PlayerCore(el);

		this._src = el.getAttribute('data-player-src') || '';
		this._lazyMode = el.getAttribute('data-player-lazy'); // "true" | "meta" | null
		this._isLazyTrue = this._lazyMode === 'true';
		this._isLazyMeta = this._lazyMode === 'meta';
		this._autoplay =
			el.getAttribute('data-player-autoplay') === 'true';
		this._initialMuted =
			el.getAttribute('data-player-muted') === 'true';
		this._unmuteOnView =
			el.getAttribute('data-player-unmute-on-view') === 'true';
		this._unmuteDelay =
			parseInt(el.getAttribute('data-player-unmute-delay'), 10) || 0;
		this._hasAutoUnmuted = false;
		this._unmuteTimer = null;

		this._isAttached = false;
		this._io = null;

		this._init();
	}

	_init() {
		var c = this.core;
		var video = c.video;

		// Reset video state
		try {
			video.pause();
		} catch (_) {}
		try {
			video.removeAttribute('src');
			video.load();
		} catch (_) {}

		c.setupVideoElement();

		// Mute/loop for autoplay
		if (this._autoplay) {
			c.setMuted(true);
			video.loop = true;
			video.autoplay = false;
		} else {
			c.setMuted(this._initialMuted);
		}
		video.setAttribute('muted', '');

		// Setup all shared UI
		c.setupMediaEvents();
		c.setupControls(this._onControl.bind(this));
		c.setupTimeline();
		c.setupFullscreenEvents();
		c.setupHoverIdle();

		// Ratio pre-fetch for non-lazy-meta when updateSize is "true"
		if (c._updateSize === 'true' && !this._isLazyMeta) {
			if (this._isLazyTrue) {
				// Do nothing: no fetch, no <video> touch when lazy=true
			} else {
				var prev = video.preload;
				video.preload = 'metadata';
				video.addEventListener(
					'loadedmetadata',
					function onMeta() {
						setBeforeRatio(
							c.el,
							c._updateSize,
							video.videoWidth,
							video.videoHeight,
						);
						video.removeEventListener('loadedmetadata', onMeta);
						video.preload = prev || '';
					},
					{ once: true },
				);
				video.src = this._src;
			}
		}

		// Initialize based on lazy mode
		if (this._isLazyMeta) {
			this._fetchMetaOnce();
			video.preload = 'none';
		} else if (this._isLazyTrue) {
			video.preload = 'none';
		} else {
			this._attachMedia();
		}

		// Autoplay via IntersectionObserver
		if (this._autoplay) {
			this._setupIntersectionObserver();
		}
	}

	_onControl(type) {
		if (type === 'pause') {
			this.core._lastPauseBy = 'manual';
			this.core.video.pause();
			return;
		}
		if (type === 'play') {
			// Hook lazy-attach into first play
			if (
				(this._isLazyTrue || this._isLazyMeta) &&
				!this._isAttached
			) {
				this._attachMedia();
			}
			this.core.pendingPlay = true;
			this.core._lastPauseBy = '';
			this.core.setStatus('loading');
			safePlay(this.core.video);
		}
	}

	_fetchMetaOnce() {
		var self = this;
		var c = this.core;
		HLSAdapter.fetchMeta(this._src, c.adapter.canUseHlsJs).then(
			function (meta) {
				if (meta.width && meta.height)
					setBeforeRatio(
						c.el,
						c._updateSize,
						meta.width,
						meta.height,
					);
				if (
					c._durationEls.length &&
					isFinite(meta.duration) &&
					meta.duration > 0
				) {
					setText(c._durationEls, formatTime(meta.duration));
				}
				readyIfIdle(c.el, c.pendingPlay);
			},
		);
	}

	_attachMedia() {
		if (this._isAttached) return;
		this._isAttached = true;

		var self = this;
		var c = this.core;
		var video = c.video;

		if (this._isLazyTrue || this._isLazyMeta) {
			video.preload = 'auto';
		}

		c.adapter.attach(this._src, function onReady() {
			readyIfIdle(c.el, c.pendingPlay);

			// Set aspect ratio from HLS levels or video dimensions
			if (c._updateSize === 'true') {
				var best = c.adapter.getBestLevel();
				if (best && best.width && best.height) {
					setBeforeRatio(
						c.el,
						c._updateSize,
						best.width,
						best.height,
					);
				}
			}

			if (c._durationEls.length && video.duration) {
				setText(c._durationEls, formatTime(video.duration));
			}
		});

		c.adapter.onLevelLoaded(function (duration) {
			if (c._durationEls.length) {
				setText(c._durationEls, formatTime(duration));
			}
		});
	}

	_setupIntersectionObserver() {
		var self = this;
		var c = this.core;
		var video = c.video;

		this._io = new IntersectionObserver(
			function (entries) {
				entries.forEach(function (entry) {
					var inView =
						entry.isIntersecting && entry.intersectionRatio > 0;

					if (inView) {
						if (
							(self._isLazyTrue || self._isLazyMeta) &&
							!self._isAttached
						) {
							self._attachMedia();
						}

						if (video.paused && c._lastPauseBy !== 'manual') {
							c._lastPauseBy = '';
							c.pendingPlay = true;
							c.setStatus('loading');
							safePlay(video);
						} else if (!video.paused) {
							c.setStatus('playing');
						}

						if (self._unmuteOnView && !self._hasAutoUnmuted) {
							self._hasAutoUnmuted = true;
							if (self._unmuteDelay > 0) {
								self._unmuteTimer = setTimeout(function () {
									c.setMuted(false);
									self._unmuteTimer = null;
								}, self._unmuteDelay);
							} else {
								c.setMuted(false);
							}
						}
					} else {
						if (!video.paused && !video.ended) {
							c._lastPauseBy = 'io';
							video.pause();
							c.setStatus('paused');
						}
					}
				});
			},
			{ threshold: 0.1 },
		);

		this._io.observe(this.el);
	}

	destroy() {
		if (this._io) {
			this._io.disconnect();
			this._io = null;
		}
		if (this._unmuteTimer) {
			clearTimeout(this._unmuteTimer);
			this._unmuteTimer = null;
		}
		this.core.destroy();
	}
}
