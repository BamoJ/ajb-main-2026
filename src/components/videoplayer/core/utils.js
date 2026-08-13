/**
 * Shared video player utility functions.
 */

export function pad2(n) {
	return (n < 10 ? '0' : '') + n;
}

export function formatTime(sec) {
	if (!isFinite(sec) || sec < 0) return '00:00';
	var s = Math.floor(sec),
		h = Math.floor(s / 3600),
		m = Math.floor((s % 3600) / 60),
		r = s % 60;
	return h > 0
		? h + ':' + pad2(m) + ':' + pad2(r)
		: pad2(m) + ':' + pad2(r);
}

export function setText(nodes, text) {
	nodes.forEach(function (n) {
		n.textContent = text;
	});
}

export function bestLevel(levels) {
	if (!levels || !levels.length) return null;
	return levels.reduce(function (a, b) {
		return (b.width || 0) > (a.width || 0) ? b : a;
	}, levels[0]);
}

export function safePlay(video) {
	var p = video.play();
	if (p && typeof p.then === 'function') p.catch(function () {});
}

export function readyIfIdle(el, pendingPlay) {
	if (
		!pendingPlay &&
		el.getAttribute('data-player-activated') !== 'true' &&
		el.getAttribute('data-player-status') === 'idle'
	) {
		el.setAttribute('data-player-status', 'ready');
	}
}

export function setBeforeRatio(el, updateSize, w, h) {
	if (updateSize !== 'true' || !w || !h) return;
	var before = el.querySelector('[data-player-before]');
	if (!before) return;
	before.style.paddingTop = (h / w) * 100 + '%';
}

export function maybeSetRatioFromVideo(el, updateSize, video) {
	if (updateSize !== 'true') return;
	var before = el.querySelector('[data-player-before]');
	if (!before) return;
	var hasPad =
		before.style.paddingTop && before.style.paddingTop !== '0%';
	if (!hasPad && video.videoWidth && video.videoHeight) {
		setBeforeRatio(
			el,
			updateSize,
			video.videoWidth,
			video.videoHeight,
		);
	}
}

export function resolveUrl(base, rel) {
	try {
		return new URL(rel, base).toString();
	} catch (_) {
		return rel;
	}
}

export function pctClamp(p) {
	return p < 0 ? 0 : p > 100 ? 100 : p;
}
