import {
	formatTime,
	setText,
	safePlay,
	readyIfIdle,
	setBeforeRatio,
	maybeSetRatioFromVideo,
	pctClamp,
} from './utils.js';
import { HLSAdapter } from './HLSAdapter.js';

/**
 * PlayerCore — all shared playback & UI logic for video players.
 *
 * Composed (not inherited) by MainPlayer, LightboxPlayer, etc.
 * Variants call only the setup*() methods they need.
 *
 * Uses AbortController for clean event listener teardown on destroy().
 */
export class PlayerCore {
	constructor(el) {
		this.el = el;
		this.video = el.querySelector('video');

		// Abort controller for all event listeners
		this._ac = new AbortController();
		this._signal = this._ac.signal;

		// Internal state
		this.pendingPlay = false;
		this._rafId = null;
		this._hoverTimer = null;
		this._trackingMove = false;
		this._lastPauseBy = '';

		// Scrub state
		this._dragging = false;
		this._wasPlaying = false;
		this._targetTime = 0;
		this._lastSeekTs = 0;
		this._seekRect = null;

		// DOM refs
		this._timeline = el.querySelector('[data-player-timeline]');
		this._progressBar = el.querySelector('[data-player-progress]');
		this._bufferedBar = el.querySelector('[data-player-buffered]');
		this._handle = el.querySelector('[data-player-timeline-handle]');
		this._durationEls = el.querySelectorAll(
			'[data-player-time-duration]',
		);
		this._progressEls = el.querySelectorAll(
			'[data-player-time-progress]',
		);

		// HLS adapter
		this.adapter = new HLSAdapter(this.video);

		// Options from data attributes
		this._updateSize =
			el.getAttribute('data-player-update-size') || null;
		this._hoverHideDelay = 1000;
		this._seekThrottle = 180;
	}

	// --- Attribute helpers ---

	setStatus(s) {
		if (this.el.getAttribute('data-player-status') !== s) {
			this.el.setAttribute('data-player-status', s);
		}
	}

	setMuted(v) {
		this.video.muted = !!v;
		this.el.setAttribute(
			'data-player-muted',
			this.video.muted ? 'true' : 'false',
		);
	}

	setFullscreen(v) {
		this.el.setAttribute(
			'data-player-fullscreen',
			v ? 'true' : 'false',
		);
	}

	setActivated(v) {
		this.el.setAttribute(
			'data-player-activated',
			v ? 'true' : 'false',
		);
	}

	// --- Setup methods (called selectively by variants) ---

	setupVideoElement() {
		var video = this.video;
		video.setAttribute('playsinline', '');
		video.setAttribute('webkit-playsinline', '');
		video.playsInline = true;
		if (typeof video.disableRemotePlayback !== 'undefined')
			video.disableRemotePlayback = true;

		if (!this.el.hasAttribute('data-player-activated'))
			this.setActivated(false);
	}

	setupMediaEvents(options = {}) {
		var self = this;
		var video = this.video;
		var signal = this._signal;
		var onEnded = options.onEnded || null;

		video.addEventListener(
			'play',
			function () {
				self.setActivated(true);
				cancelAnimationFrame(self._rafId);
				self._loop();
				self.setStatus('playing');
			},
			{ signal },
		);

		video.addEventListener(
			'playing',
			function () {
				self.pendingPlay = false;
				self.setStatus('playing');
			},
			{ signal },
		);

		video.addEventListener(
			'pause',
			function () {
				self.pendingPlay = false;
				cancelAnimationFrame(self._rafId);
				self._updateProgressVisuals();
				self.setStatus('paused');
			},
			{ signal },
		);

		video.addEventListener(
			'waiting',
			function () {
				self.setStatus('loading');
			},
			{ signal },
		);

		video.addEventListener(
			'canplay',
			function () {
				readyIfIdle(self.el, self.pendingPlay);
			},
			{ signal },
		);

		video.addEventListener(
			'ended',
			function () {
				self.pendingPlay = false;
				cancelAnimationFrame(self._rafId);
				self._updateProgressVisuals();

				if (onEnded) {
					onEnded();
				} else {
					self.setStatus('paused');
					self.setActivated(false);
				}
			},
			{ signal },
		);

		// Time text updates
		video.addEventListener(
			'timeupdate',
			function () {
				self._updateTimeTexts();
			},
			{ signal },
		);
		video.addEventListener(
			'loadedmetadata',
			function () {
				self._updateTimeTexts();
				maybeSetRatioFromVideo(self.el, self._updateSize, video);
			},
			{ signal },
		);
		video.addEventListener(
			'loadeddata',
			function () {
				maybeSetRatioFromVideo(self.el, self._updateSize, video);
			},
			{ signal },
		);
		video.addEventListener(
			'playing',
			function () {
				maybeSetRatioFromVideo(self.el, self._updateSize, video);
			},
			{ signal },
		);
		video.addEventListener(
			'durationchange',
			function () {
				self._updateTimeTexts();
			},
			{ signal },
		);

		// Buffered bar
		video.addEventListener(
			'progress',
			function () {
				self._updateBufferedBar();
			},
			{ signal },
		);
		video.addEventListener(
			'loadedmetadata',
			function () {
				self._updateBufferedBar();
			},
			{ signal },
		);
		video.addEventListener(
			'durationchange',
			function () {
				self._updateBufferedBar();
			},
			{ signal },
		);
	}

	setupControls(extraHandler) {
		var self = this;
		this.el.addEventListener(
			'click',
			function (e) {
				var btn = e.target.closest('[data-player-control]');
				if (!btn || !self.el.contains(btn)) return;
				var type = btn.getAttribute('data-player-control');
				if (
					type === 'play' ||
					type === 'pause' ||
					type === 'playpause'
				) {
					var isPlaying = !self.video.paused && !self.video.ended;
					if (extraHandler)
						extraHandler(isPlaying ? 'pause' : 'play');
					else self.togglePlay();
				} else if (type === 'mute') {
					self.toggleMute();
				} else if (type === 'fullscreen') {
					self.toggleFullscreen();
				}
			},
			{ signal: this._signal },
		);
	}

	setupTimeline() {
		var timeline = this._timeline;
		if (!timeline) return;

		var self = this;
		var signal = this._signal;

		window.addEventListener(
			'resize',
			function () {
				if (!self._dragging) self._seekRect = null;
			},
			{ signal },
		);

		function getFractionFromX(x) {
			if (!self._seekRect)
				self._seekRect = timeline.getBoundingClientRect();
			var f = (x - self._seekRect.left) / self._seekRect.width;
			if (f < 0) f = 0;
			if (f > 1) f = 1;
			return f;
		}

		function previewAtFraction(f) {
			if (!self.video.duration) return;
			var pct = f * 100;
			if (self._progressBar)
				self._progressBar.style.transform =
					'translateX(' + (-100 + pct) + '%)';
			if (self._handle) self._handle.style.left = pct + '%';
			if (self._progressEls.length)
				setText(
					self._progressEls,
					formatTime(f * self.video.duration),
				);
		}

		function maybeSeek(now) {
			if (!self.video.duration) return;
			if (now - self._lastSeekTs < self._seekThrottle) return;
			self._lastSeekTs = now;
			self.video.currentTime = self._targetTime;
		}

		// These need to be named so we can remove them from window
		var onPointerMove, onPointerUp;

		function onPointerDown(e) {
			if (!self.video.duration) return;
			self._dragging = true;
			self._wasPlaying = !self.video.paused && !self.video.ended;
			if (self._wasPlaying) self.video.pause();
			self.el.setAttribute('data-timeline-drag', 'true');
			self._seekRect = timeline.getBoundingClientRect();
			var f = getFractionFromX(e.clientX);
			self._targetTime = f * self.video.duration;
			previewAtFraction(f);
			maybeSeek(performance.now());
			if (timeline.setPointerCapture)
				timeline.setPointerCapture(e.pointerId);
			window.addEventListener('pointermove', onPointerMove, {
				passive: false,
			});
			window.addEventListener('pointerup', onPointerUp, {
				passive: true,
			});
			e.preventDefault();
		}

		onPointerMove = function (e) {
			if (!self._dragging) return;
			var f = getFractionFromX(e.clientX);
			self._targetTime = f * self.video.duration;
			previewAtFraction(f);
			maybeSeek(performance.now());
			e.preventDefault();
		};

		onPointerUp = function () {
			if (!self._dragging) return;
			self._dragging = false;
			self.el.setAttribute('data-timeline-drag', 'false');
			self._seekRect = null;
			self.video.currentTime = self._targetTime;
			if (self._wasPlaying) safePlay(self.video);
			else {
				self._updateProgressVisuals();
				self._updateTimeTexts();
			}
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		};

		timeline.addEventListener('pointerdown', onPointerDown, {
			passive: false,
			signal,
		});
		if (this._handle) {
			this._handle.addEventListener('pointerdown', onPointerDown, {
				passive: false,
				signal,
			});
		}
	}

	setupFullscreenEvents() {
		var self = this;
		var signal = this._signal;

		// Check if THIS player (or its video) is the fullscreen element
		function isThisPlayerFs() {
			var fsEl =
				document.fullscreenElement ||
				document.webkitFullscreenElement;
			if (!fsEl) return false;
			return (
				fsEl === self.el ||
				self.el.contains(fsEl) ||
				fsEl.contains(self.el)
			);
		}

		document.addEventListener(
			'fullscreenchange',
			function () {
				self.setFullscreen(isThisPlayerFs());
			},
			{ signal },
		);
		document.addEventListener(
			'webkitfullscreenchange',
			function () {
				self.setFullscreen(isThisPlayerFs());
			},
			{ signal },
		);
		this.video.addEventListener(
			'webkitbeginfullscreen',
			function () {
				self.setFullscreen(true);
			},
			{ signal },
		);
		this.video.addEventListener(
			'webkitendfullscreen',
			function () {
				self.setFullscreen(false);
			},
			{ signal },
		);
	}

	setupHoverIdle() {
		var self = this;
		var signal = this._signal;

		function setHover(state) {
			if (self.el.getAttribute('data-player-hover') !== state) {
				self.el.setAttribute('data-player-hover', state);
			}
		}

		function scheduleHide() {
			clearTimeout(self._hoverTimer);
			self._hoverTimer = setTimeout(function () {
				setHover('idle');
			}, self._hoverHideDelay);
		}

		function wakeControls() {
			setHover('active');
			scheduleHide();
		}

		self.el.addEventListener('pointerdown', wakeControls, { signal });
		document.addEventListener('fullscreenchange', wakeControls, {
			signal,
		});
		document.addEventListener(
			'webkitfullscreenchange',
			wakeControls,
			{ signal },
		);

		var onPointerMoveGlobal = function (e) {
			var r = self.el.getBoundingClientRect();
			if (
				e.clientX >= r.left &&
				e.clientX <= r.right &&
				e.clientY >= r.top &&
				e.clientY <= r.bottom
			)
				wakeControls();
		};

		self.el.addEventListener(
			'pointerenter',
			function () {
				wakeControls();
				if (!self._trackingMove) {
					self._trackingMove = true;
					window.addEventListener(
						'pointermove',
						onPointerMoveGlobal,
						{
							passive: true,
						},
					);
				}
			},
			{ signal },
		);

		self.el.addEventListener(
			'pointerleave',
			function () {
				setHover('idle');
				clearTimeout(self._hoverTimer);
				if (self._trackingMove) {
					self._trackingMove = false;
					window.removeEventListener(
						'pointermove',
						onPointerMoveGlobal,
					);
				}
			},
			{ signal },
		);

		// Cleanup global listener on destroy
		signal.addEventListener('abort', function () {
			if (self._trackingMove) {
				window.removeEventListener(
					'pointermove',
					onPointerMoveGlobal,
				);
				self._trackingMove = false;
			}
		});
	}

	// --- Playback commands ---

	togglePlay() {
		if (this.video.paused || this.video.ended) {
			this.pendingPlay = true;
			this._lastPauseBy = '';
			this.setStatus('loading');
			safePlay(this.video);
		} else {
			this._lastPauseBy = 'manual';
			this.video.pause();
		}
	}

	toggleMute() {
		this.video.muted = !this.video.muted;
		this.el.setAttribute(
			'data-player-muted',
			this.video.muted ? 'true' : 'false',
		);
	}

	toggleFullscreen() {
		var el = this.el;
		var video = this.video;

		function isFsActive() {
			return !!(
				document.fullscreenElement || document.webkitFullscreenElement
			);
		}

		if (isFsActive() || video.webkitDisplayingFullscreen) {
			if (document.exitFullscreen) document.exitFullscreen();
			else if (document.webkitExitFullscreen)
				document.webkitExitFullscreen();
			else if (
				video.webkitDisplayingFullscreen &&
				typeof video.webkitExitFullscreen === 'function'
			)
				video.webkitExitFullscreen();
		} else {
			if (el.requestFullscreen) el.requestFullscreen();
			else if (video.requestFullscreen) video.requestFullscreen();
			else if (
				video.webkitSupportsFullscreen &&
				typeof video.webkitEnterFullscreen === 'function'
			)
				video.webkitEnterFullscreen();
		}
	}

	// --- Internal visual updates ---

	_updateProgressVisuals() {
		if (!this.video.duration) return;
		var playedPct =
			(this.video.currentTime / this.video.duration) * 100;
		if (this._progressBar)
			this._progressBar.style.transform =
				'translateX(' + (-100 + playedPct) + '%)';
		if (this._handle)
			this._handle.style.left = pctClamp(playedPct) + '%';
	}

	_loop() {
		var self = this;
		self._updateProgressVisuals();
		if (!self.video.paused && !self.video.ended) {
			self._rafId = requestAnimationFrame(function () {
				self._loop();
			});
		}
	}

	_updateBufferedBar() {
		if (
			!this._bufferedBar ||
			!this.video.duration ||
			!this.video.buffered.length
		)
			return;
		var end = this.video.buffered.end(this.video.buffered.length - 1);
		var buffPct = (end / this.video.duration) * 100;
		this._bufferedBar.style.transform =
			'translateX(' + (-100 + buffPct) + '%)';
	}

	_updateTimeTexts() {
		if (this._durationEls.length)
			setText(this._durationEls, formatTime(this.video.duration));
		if (this._progressEls.length)
			setText(this._progressEls, formatTime(this.video.currentTime));
	}

	// --- Ratio ---

	applyRatioFromDimensions(w, h) {
		setBeforeRatio(this.el, this._updateSize, w, h);
	}

	// --- Cleanup ---

	destroy() {
		cancelAnimationFrame(this._rafId);
		clearTimeout(this._hoverTimer);
		this._ac.abort();
		this.adapter.destroy();
	}
}
