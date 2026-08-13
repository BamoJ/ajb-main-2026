import { PlayerCore } from '../core/PlayerCore.js';
import {
	safePlay,
	readyIfIdle,
	setText,
	formatTime,
} from '../core/utils.js';

/**
 * LightboxPlayer — modal/popup video player.
 *
 * Adds on top of PlayerCore:
 *  - open(src, placeholderUrl) / close() API
 *  - Deferred HLS attach on open (planOnOpen, attachMediaFor)
 *  - Placeholder image preload before opening
 *  - ResizeObserver layout clamping (setupLightboxClamp)
 *  - ESC key to close, auto-close on video ended
 *  - Global [data-video-lightbox-control] click delegation
 *  - iOS-safe ratio setter fallback chain
 */
export class LightboxPlayer {
	constructor(el) {
		this.el = el;
		this.wrapper = el.closest('[data-video-lightbox-status]');
		this.core = new PlayerCore(el);

		this._currentSrc = '';
		this._isAttached = false;
		this._autoplay = el.getAttribute('data-player-autoplay') === 'true';
		this._initialMuted = el.getAttribute('data-player-muted') === 'true';
		this._autoStartOnReady = false;
		this._placeholder =
			el.querySelector('[data-video-lightbox-placeholder]') ||
			el.querySelector('[data-bunny-lightbox-placeholder]');

		// Clamp state
		this._clampRo = null;
		this._applyClamp = null;

		this._init();
	}

	_init() {
		var c = this.core;
		var video = c.video;

		// Reset video state
		try { video.pause(); } catch (_) {}
		try { video.removeAttribute('src'); video.load(); } catch (_) {}

		c.setupVideoElement();
		video.loop = false;
		c.setMuted(this._initialMuted);
		if (this._autoplay) video.autoplay = false;

		// Setup shared UI — custom ended handler to close lightbox
		var self = this;
		c.setupMediaEvents({
			onEnded: function () {
				c.pendingPlay = false;
				c.setActivated(false);
				video.currentTime = 0;

				// Exit fullscreen if active
				if (
					document.fullscreenElement ||
					document.webkitFullscreenElement ||
					video.webkitDisplayingFullscreen
				) {
					if (document.exitFullscreen) document.exitFullscreen();
					else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
					else if (video.webkitExitFullscreen) video.webkitExitFullscreen();
				}

				self.close();
			},
		});

		// Override loadedmetadata/loadeddata/playing to use iOS-safe ratio setter
		var signal = c._signal;
		video.addEventListener('loadedmetadata', function () { self._updateBeforeRatioIOSSafe(); }, { signal });
		video.addEventListener('loadeddata', function () { self._updateBeforeRatioIOSSafe(); }, { signal });
		video.addEventListener('playing', function () { self._updateBeforeRatioIOSSafe(); }, { signal });

		c.setupControls();
		c.setupTimeline();
		c.setupFullscreenEvents();
		c.setupHoverIdle();

		this._setupClamp();
	}

	// --- Open/Close API ---

	open(src, placeholderUrl) {
		if (!src) return;
		var self = this;

		function activate() {
			self._ensureUI(true);
			self._planOnOpen(src);
		}

		if (this._placeholder && placeholderUrl) {
			var needsSwap = this._placeholder.getAttribute('src') !== placeholderUrl;
			if (needsSwap || !this._placeholder.complete || !this._placeholder.naturalWidth) {
				this._placeholder.onload = function () {
					self._placeholder.onload = null;
					activate();
				};
				this._placeholder.onerror = function () {
					self._placeholder.onerror = null;
					activate();
				};
				if (needsSwap) this._placeholder.setAttribute('src', placeholderUrl);
				else this._placeholder.dispatchEvent(new Event('load'));
			} else {
				activate();
			}
		} else {
			activate();
		}
	}

	close() {
		this._ensureUI(false);

		var video = this.core.video;
		var hasPlayed = false;
		try {
			if (video.played && video.played.length) {
				for (var i = 0; i < video.played.length; i++) {
					if (video.played.end(i) > 0) {
						hasPlayed = true;
						break;
					}
				}
			} else {
				hasPlayed = video.currentTime > 0;
			}
		} catch (_) {}

		try {
			if (!video.paused && !video.ended) video.pause();
		} catch (_) {}

		this.core.setActivated(false);
		this.core.setStatus(hasPlayed ? 'paused' : 'idle');
	}

	// --- Internal ---

	_planOnOpen(nextSrc) {
		var video = this.core.video;
		var same = this._currentSrc && this._currentSrc === nextSrc;

		if (!same) {
			try {
				if (!video.paused && !video.ended) video.pause();
			} catch (_) {}

			this.core.adapter.destroy();
			this._isAttached = false;
			this._currentSrc = '';
			if (this.core._durationEls.length) setText(this.core._durationEls, '00:00');
			this.core.setActivated(false);
			this.core.setStatus('idle');

			this._attachMediaFor(nextSrc);
			this._autoStartOnReady = !!this._autoplay;
			this.core.pendingPlay = !!this._autoplay;
			return;
		}

		this._autoStartOnReady = !!this._autoplay;
		if (this._autoplay) {
			this.core.setStatus('loading');
			safePlay(video);
		} else {
			try {
				if (!video.paused && !video.ended) video.pause();
			} catch (_) {}
			this.core.setActivated(false);
			this.core.setStatus('paused');
		}
	}

	_attachMediaFor(src) {
		if (this._currentSrc === src && this._isAttached) return;

		var self = this;
		var c = this.core;
		var video = c.video;

		if (c._durationEls.length) setText(c._durationEls, '00:00');

		this._currentSrc = src;
		this._isAttached = true;

		c.adapter.attach(src, function onReady() {
			readyIfIdle(c.el, c.pendingPlay);
			self._updateBeforeRatioIOSSafe();
			if (self._applyClamp) self._applyClamp();
			if (c._durationEls.length && video.duration)
				setText(c._durationEls, formatTime(video.duration));

			if (
				self._autoStartOnReady &&
				self.wrapper &&
				self.wrapper.getAttribute('data-video-lightbox-status') === 'active'
			) {
				c.setStatus('loading');
				safePlay(video);
				self._autoStartOnReady = false;
			}
		});

		c.adapter.onLevelLoaded(function (duration) {
			if (c._durationEls.length) {
				setText(c._durationEls, formatTime(duration));
			}
		});
	}

	_ensureUI(isActive) {
		if (!this.wrapper) return;
		var state = isActive ? 'active' : 'not-active';
		if (this.wrapper.getAttribute('data-video-lightbox-status') !== state) {
			this.wrapper.setAttribute('data-video-lightbox-status', state);
		}
		if (isActive && this._applyClamp) this._applyClamp();
	}

	_isActive() {
		return this.wrapper && this.wrapper.getAttribute('data-video-lightbox-status') === 'active';
	}

	_setupClamp() {
		if (!this.wrapper) return;
		var calcBox =
			this.wrapper.querySelector('[data-video-lightbox-calc-height]') ||
			this.wrapper.querySelector('[data-bunny-lightbox-calc-height]');
		if (!calcBox) return;

		var self = this;
		var c = this.core;
		var video = c.video;
		var updateSize = c._updateSize;
		var wrapper = this.wrapper;

		function getRatio() {
			if (updateSize === 'cover') return null;

			if (updateSize === 'true') {
				if (video.videoWidth && video.videoHeight)
					return video.videoWidth / video.videoHeight;
				var before = c.el.querySelector('[data-player-before]');
				if (before && before.style && before.style.paddingTop) {
					var pct = parseFloat(before.style.paddingTop);
					if (pct > 0) return 100 / pct;
				}
				var r = c.el.getBoundingClientRect();
				if (r.height > 0) return r.width / r.height;
				return 16 / 9;
			}

			var beforeFalse = c.el.querySelector('[data-player-before]');
			if (beforeFalse && beforeFalse.style && beforeFalse.style.paddingTop) {
				var pad = parseFloat(beforeFalse.style.paddingTop);
				if (pad > 0) return 100 / pad;
			}
			var rb = c.el.getBoundingClientRect();
			if (rb.height > 0) return rb.width / rb.height;
			return 16 / 9;
		}

		function applyClamp() {
			if (updateSize === 'cover') {
				calcBox.style.maxWidth = '';
				calcBox.style.maxHeight = '';
				return;
			}

			var parent = wrapper;
			var cs = getComputedStyle(parent);
			var pt = parseFloat(cs.paddingTop) || 0;
			var pb = parseFloat(cs.paddingBottom) || 0;
			var pl = parseFloat(cs.paddingLeft) || 0;
			var pr = parseFloat(cs.paddingRight) || 0;

			var cw = parent.clientWidth - pl - pr;
			var ch = parent.clientHeight - pt - pb;
			if (cw <= 0 || ch <= 0) return;

			var ratio = getRatio();
			if (!ratio) {
				calcBox.style.maxWidth = '';
				calcBox.style.maxHeight = '';
				return;
			}

			var hIfFullWidth = cw / ratio;

			if (hIfFullWidth <= ch) {
				calcBox.style.maxWidth = '100%';
				calcBox.style.maxHeight = (hIfFullWidth / ch) * 100 + '%';
			} else {
				calcBox.style.maxHeight = '100%';
				calcBox.style.maxWidth = ((ch * ratio) / cw) * 100 + '%';
			}
		}

		var rafPending = false;
		function debouncedApply() {
			if (rafPending) return;
			if (wrapper.getAttribute('data-video-lightbox-status') !== 'active') return;
			rafPending = true;
			requestAnimationFrame(function () {
				rafPending = false;
				applyClamp();
			});
		}

		this._clampRo = new ResizeObserver(debouncedApply);
		this._clampRo.observe(wrapper);
		this._applyClamp = debouncedApply;

		var signal = c._signal;
		window.addEventListener('resize', debouncedApply, { signal });
		window.addEventListener('orientationchange', debouncedApply, { signal });

		if (updateSize === 'true') {
			video.addEventListener('loadedmetadata', debouncedApply, { signal });
			video.addEventListener('loadeddata', debouncedApply, { signal });
			video.addEventListener('playing', debouncedApply, { signal });
		}

		debouncedApply();
	}

	_updateBeforeRatioIOSSafe() {
		var c = this.core;
		if (c._updateSize !== 'true') return;
		var before = c.el.querySelector('[data-player-before]');
		if (!before) return;

		var self = this;
		var video = c.video;

		function apply(w, h) {
			if (!w || !h) return;
			before.style.paddingTop = (h / w) * 100 + '%';
			if (self._applyClamp) self._applyClamp();
		}

		// Try video dimensions first
		if (video.videoWidth && video.videoHeight) {
			apply(video.videoWidth, video.videoHeight);
			return;
		}

		// Try HLS levels
		if (c.adapter.hls && c.adapter.hls.levels && c.adapter.hls.levels.length) {
			var lvls = c.adapter.hls.levels;
			var best = lvls.reduce(function (a, b) {
				return (b.width || 0) > (a.width || 0) ? b : a;
			}, lvls[0]);
			if (best && best.width && best.height) {
				apply(best.width, best.height);
				return;
			}
		}

		// Fallback: rAF + fetch master playlist
		requestAnimationFrame(function () {
			if (video.videoWidth && video.videoHeight) {
				apply(video.videoWidth, video.videoHeight);
				return;
			}

			var master = typeof self._currentSrc === 'string' && self._currentSrc ? self._currentSrc : '';
			if (!master || master.indexOf('blob:') === 0) {
				var attrSrc =
					c.el.getAttribute('data-video-lightbox-src') ||
					c.el.getAttribute('data-player-src') ||
					'';
				if (attrSrc && attrSrc.indexOf('blob:') !== 0) master = attrSrc;
			}
			if (!master || !/^https?:/i.test(master)) return;

			fetch(master, { credentials: 'omit', cache: 'no-store' })
				.then(function (r) {
					if (!r.ok) throw new Error();
					return r.text();
				})
				.then(function (txt) {
					var lines = txt.split(/\r?\n/);
					var bestW = 0,
						bestH = 0,
						last = null;
					for (var i = 0; i < lines.length; i++) {
						var line = lines[i];
						if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
							last = line;
						} else if (last && line && line[0] !== '#') {
							var m = /RESOLUTION=(\d+)x(\d+)/.exec(last);
							if (m) {
								var W = parseInt(m[1], 10),
									H = parseInt(m[2], 10);
								if (W > bestW) {
									bestW = W;
									bestH = H;
								}
							}
							last = null;
						}
					}
					if (bestW && bestH) apply(bestW, bestH);
				})
				.catch(function () {});
		});
	}

	destroy() {
		if (this._clampRo) {
			this._clampRo.disconnect();
			this._clampRo = null;
		}
		this.core.destroy();
	}
}
