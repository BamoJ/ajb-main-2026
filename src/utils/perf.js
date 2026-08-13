import { addRaf } from '@core/raf';

/**
 * Performance monitoring — FPS overlay, frame-drop detection, web vitals,
 * timing marks. Auto-initializes on import.
 *
 * Usage:
 *   import perf from '@utils/perf'
 *   perf.add('appReady')             // record a timing mark
 *   perf.getMarks()                  // all marks
 *   perf.getFps()                    // rolling FPS (last 60 frames)
 *   perf.getMetrics()                // fps, frame time, min/max, smoothness, budget
 *   perf.getWebVitals()              // { fcp, lcp, cls }
 *   perf.toggleFpsDisplay()          // also bound to Shift+F
 *   perf.enableFrameDropDetection()  // start tracking >50ms frames
 *   perf.getFrameDrops()             // history of last 50 drops
 *   perf.cleanup()                   // disconnect observers + remove overlay
 *
 * The FPS overlay's visibility persists across reloads in localStorage,
 * so toggling it on a staging URL stays on after refresh / page nav.
 */

const FPS_LS_KEY = 'sbj:perfFps';
const FRAME_BUDGET = 16.67;
const DROP_THRESHOLD = 50;
const FRAME_HISTORY = 60;
const DROP_HISTORY = 50;

const state = {
	marks: [],
	vitals: { fcp: null, lcp: null, cls: 0 },
	fpsEl: null,
	frameTimes: [],
	lastFrameTime: 0,
	frameDropsEnabled: false,
	frameDrops: [],
	observers: [],
	rafUnsub: null,
	keyHandler: null,
};

function add(name) {
	state.marks.push({ name, time: performance.now() });
}

function getMarks() {
	return state.marks.slice();
}

function onFrame(time) {
	if (state.lastFrameTime !== 0) {
		const delta = time - state.lastFrameTime;
		state.frameTimes.push(delta);
		if (state.frameTimes.length > FRAME_HISTORY) {
			state.frameTimes.shift();
		}
		if (state.frameDropsEnabled && delta > DROP_THRESHOLD) {
			state.frameDrops.push({ time, delta });
			if (state.frameDrops.length > DROP_HISTORY) {
				state.frameDrops.shift();
			}
		}
		if (state.fpsEl) updateFpsDisplay();
	}
	state.lastFrameTime = time;
}

function getFps() {
	if (state.frameTimes.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < state.frameTimes.length; i++) {
		sum += state.frameTimes[i];
	}
	return Math.round(1000 / (sum / state.frameTimes.length));
}

function getMetrics() {
	if (state.frameTimes.length === 0) {
		return {
			fps: 0,
			frameTime: '0.00',
			min: '0.00',
			max: '0.00',
			smoothness: '0',
			budget: '0',
		};
	}
	let sum = 0;
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < state.frameTimes.length; i++) {
		const t = state.frameTimes[i];
		sum += t;
		if (t < min) min = t;
		if (t > max) max = t;
	}
	const avg = sum / state.frameTimes.length;
	let varSum = 0;
	for (let i = 0; i < state.frameTimes.length; i++) {
		const d = state.frameTimes[i] - avg;
		varSum += d * d;
	}
	const stddev = Math.sqrt(varSum / state.frameTimes.length);
	const smoothness = Math.max(
		0,
		Math.min(100, 100 - (stddev / avg) * 100),
	);
	let compliant = 0;
	for (let i = 0; i < state.frameTimes.length; i++) {
		if (state.frameTimes[i] <= FRAME_BUDGET) compliant++;
	}
	return {
		fps: Math.round(1000 / avg),
		frameTime: avg.toFixed(2),
		min: min.toFixed(2),
		max: max.toFixed(2),
		smoothness: smoothness.toFixed(0),
		budget: ((compliant / state.frameTimes.length) * 100).toFixed(0),
	};
}

function collectWebVitals() {
	if (typeof PerformanceObserver === 'undefined') return;

	try {
		const fcpObs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.name === 'first-contentful-paint') {
					state.vitals.fcp = entry.startTime;
				}
			}
		});
		fcpObs.observe({ type: 'paint', buffered: true });
		state.observers.push(fcpObs);
	} catch {}

	try {
		const lcpObs = new PerformanceObserver((list) => {
			const entries = list.getEntries();
			const last = entries[entries.length - 1];
			if (last) state.vitals.lcp = last.startTime;
		});
		lcpObs.observe({
			type: 'largest-contentful-paint',
			buffered: true,
		});
		state.observers.push(lcpObs);
	} catch {}

	try {
		const clsObs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (!entry.hadRecentInput) state.vitals.cls += entry.value;
			}
		});
		clsObs.observe({ type: 'layout-shift', buffered: true });
		state.observers.push(clsObs);
	} catch {}
}

function getWebVitals() {
	return { ...state.vitals };
}

function bindKeyboard() {
	state.keyHandler = (e) => {
		if (!e.shiftKey || e.repeat) return;
		if (e.key !== 'F' && e.key !== 'f') return;
		const t = e.target;
		if (
			t &&
			(t.tagName === 'INPUT' ||
				t.tagName === 'TEXTAREA' ||
				t.isContentEditable)
		) {
			return;
		}
		toggleFpsDisplay();
	};
	window.addEventListener('keydown', state.keyHandler);
}

function ensureFpsEl() {
	if (state.fpsEl) return state.fpsEl;
	if (!document.body) return null;
	const el = document.createElement('div');
	el.style.cssText =
		'position:fixed;bottom:8px;left:8px;z-index:999999;' +
		'padding:6px 8px;background:rgba(0,0,0,.75);color:#0f0;' +
		'font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;' +
		'pointer-events:none;border-radius:4px;white-space:pre;';
	document.body.appendChild(el);
	state.fpsEl = el;
	return el;
}

function updateFpsDisplay() {
	if (!state.fpsEl) return;
	const m = getMetrics();
	state.fpsEl.textContent =
		`${m.fps} fps  ${m.frameTime}ms\n` +
		`min ${m.min}  max ${m.max}\n` +
		`smooth ${m.smoothness}%  budget ${m.budget}%`;
}

function showFpsDisplay() {
	ensureFpsEl();
	try {
		localStorage.setItem(FPS_LS_KEY, '1');
	} catch {}
}

function hideFpsDisplay() {
	if (state.fpsEl?.parentNode) {
		state.fpsEl.parentNode.removeChild(state.fpsEl);
	}
	state.fpsEl = null;
	try {
		localStorage.removeItem(FPS_LS_KEY);
	} catch {}
}

function toggleFpsDisplay() {
	if (state.fpsEl) hideFpsDisplay();
	else showFpsDisplay();
}

function enableFrameDropDetection() {
	state.frameDropsEnabled = true;
}

function getFrameDrops() {
	return state.frameDrops.slice();
}

function cleanup() {
	state.observers.forEach((o) => {
		try {
			o.disconnect();
		} catch {}
	});
	state.observers = [];
	state.rafUnsub?.();
	state.rafUnsub = null;
	if (state.keyHandler) {
		window.removeEventListener('keydown', state.keyHandler);
	}
	state.keyHandler = null;
	if (state.fpsEl?.parentNode) {
		state.fpsEl.parentNode.removeChild(state.fpsEl);
	}
	state.fpsEl = null;
}

function init() {
	collectWebVitals();
	bindKeyboard();
	state.rafUnsub = addRaf(onFrame, 10);
	add('perf:init');

	const restore = () => {
		try {
			if (localStorage.getItem(FPS_LS_KEY) === '1') showFpsDisplay();
		} catch {}
	};
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', restore, {
			once: true,
		});
	} else {
		restore();
	}
}

init();

const perf = {
	add,
	getMarks,
	getFps,
	getMetrics,
	getWebVitals,
	showFpsDisplay,
	hideFpsDisplay,
	toggleFpsDisplay,
	enableFrameDropDetection,
	getFrameDrops,
	cleanup,
};

// Console handle for ad-hoc profiling: perf.getMetrics(), perf.getWebVitals(),
// perf.enableFrameDropDetection() + perf.getFrameDrops(), perf.toggleFpsDisplay().
if (typeof window !== 'undefined') window.perf = perf;

export default perf;
