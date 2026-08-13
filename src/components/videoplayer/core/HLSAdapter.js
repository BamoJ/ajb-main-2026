import Hls from 'hls.js/dist/hls.light.mjs';
import { bestLevel, resolveUrl } from './utils.js';

/**
 * HLSAdapter — single place for HLS.js + Safari native fallback.
 *
 * Provides:
 *  - attach(src, onReady)    Attach media to <video>, call onReady on manifest parsed
 *  - onLevelLoaded(cb)       Subscribe to LEVEL_LOADED (HLS.js only)
 *  - getBestLevel()          Returns best resolution level (HLS.js only)
 *  - static fetchMeta(src)   Fetch duration + resolution without attaching playback
 *  - destroy()               Tear down HLS instance
 */
export class HLSAdapter {
	constructor(video) {
		this.video = video;
		this.hls = null;
		this.isSafariNative = !!video.canPlayType(
			'application/vnd.apple.mpegurl',
		);
		this.canUseHlsJs =
			!!(Hls && Hls.isSupported()) && !this.isSafariNative;
	}

	attach(src, onReady) {
		this.destroy();

		if (this.isSafariNative) {
			this.video.preload = 'auto';
			this.video.src = src;
			this.video.addEventListener('loadedmetadata', onReady, {
				once: true,
			});
			return;
		}

		if (this.canUseHlsJs) {
			this.hls = new Hls({ maxBufferLength: 10 });
			this.hls.attachMedia(this.video);
			this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
				this.hls.loadSource(src);
			});
			this.hls.on(Hls.Events.MANIFEST_PARSED, onReady);
			return;
		}

		// Plain src fallback
		this.video.preload = 'auto';
		this.video.src = src;
		this.video.addEventListener('loadedmetadata', onReady, {
			once: true,
		});
	}

	onLevelLoaded(cb) {
		if (this.hls) {
			this.hls.on(Hls.Events.LEVEL_LOADED, function (e, data) {
				if (
					data &&
					data.details &&
					isFinite(data.details.totalduration)
				) {
					cb(data.details.totalduration);
				}
			});
		}
	}

	getBestLevel() {
		return this.hls ? bestLevel(this.hls.levels) : null;
	}

	destroy() {
		if (this.hls) {
			try {
				this.hls.destroy();
			} catch (_) {}
			this.hls = null;
		}
	}

	/**
	 * Fetch metadata (resolution + duration) from an HLS manifest
	 * without attaching to a <video> element.
	 */
	static fetchMeta(src, canUseHlsJs) {
		return new Promise(function (resolve) {
			if (canUseHlsJs && Hls && Hls.isSupported()) {
				try {
					var tmp = new Hls();
					var out = { width: 0, height: 0, duration: NaN };

					tmp.on(Hls.Events.MANIFEST_PARSED, function (e, data) {
						var lvls = (data && data.levels) || tmp.levels || [];
						var best = bestLevel(lvls);
						if (best && best.width && best.height) {
							out.width = best.width;
							out.height = best.height;
						}
					});
					tmp.on(Hls.Events.LEVEL_LOADED, function (e, data) {
						if (
							data &&
							data.details &&
							isFinite(data.details.totalduration)
						) {
							out.duration = data.details.totalduration;
						}
						try {
							tmp.destroy();
						} catch (_) {}
						resolve(out);
					});
					tmp.on(Hls.Events.ERROR, function () {
						try {
							tmp.destroy();
						} catch (_) {}
						resolve(out);
					});

					tmp.loadSource(src);
					return;
				} catch (_) {
					resolve({ width: 0, height: 0, duration: NaN });
					return;
				}
			}

			// Fallback: raw fetch + parse HLS playlist
			function parseMaster(masterText) {
				var lines = masterText.split(/\r?\n/);
				var bestW = 0,
					bestH = 0,
					firstMedia = null,
					lastInf = null;
				for (var i = 0; i < lines.length; i++) {
					var line = lines[i];
					if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
						lastInf = line;
					} else if (lastInf && line && line[0] !== '#') {
						if (!firstMedia) firstMedia = line.trim();
						var m = /RESOLUTION=(\d+)x(\d+)/.exec(lastInf);
						if (m) {
							var w = parseInt(m[1], 10),
								h = parseInt(m[2], 10);
							if (w > bestW) {
								bestW = w;
								bestH = h;
							}
						}
						lastInf = null;
					}
				}
				return { bestW: bestW, bestH: bestH, media: firstMedia };
			}

			function sumDuration(mediaText) {
				var dur = 0,
					re = /#EXTINF:([\d.]+)/g,
					m;
				while ((m = re.exec(mediaText))) dur += parseFloat(m[1]);
				return dur;
			}

			fetch(src, { credentials: 'omit', cache: 'no-store' })
				.then(function (r) {
					if (!r.ok) throw new Error('master');
					return r.text();
				})
				.then(function (master) {
					var info = parseMaster(master);
					if (!info.media) {
						resolve({
							width: info.bestW || 0,
							height: info.bestH || 0,
							duration: NaN,
						});
						return;
					}
					var mediaUrl = resolveUrl(src, info.media);
					return fetch(mediaUrl, {
						credentials: 'omit',
						cache: 'no-store',
					})
						.then(function (r) {
							if (!r.ok) throw new Error('media');
							return r.text();
						})
						.then(function (mediaText) {
							resolve({
								width: info.bestW || 0,
								height: info.bestH || 0,
								duration: sumDuration(mediaText),
							});
						});
				})
				.catch(function () {
					resolve({ width: 0, height: 0, duration: NaN });
				});
		});
	}
}
