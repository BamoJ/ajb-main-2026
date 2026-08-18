import emitter from '@utils/Emitter';

/**
 * Theme switching across Taxi page transitions.
 *
 * Pages set their theme on <body> via Webflow utility classes
 * (u-theme-dark / u-theme-light / u-theme-brand). Taxi only swaps the
 * [data-taxi-view] content and never replaces <body>, so the body theme goes
 * stale on SPA navigation. This module reads the incoming page's authored
 * <body> class (from Taxi's fetched document) and applies it to the live body,
 * cross-fading via the .is-theme-switching CSS rule (see styles/theme.css).
 *
 * applyTheme() broadcasts `theme:change` and getTheme() exposes the current
 * token, so any module can follow the theme without importing this one's
 * consumers.
 */

const PREFIX = 'u-theme-';
const THEMES = ['dark', 'light', 'brand'];
const SWITCH_MS = 600; // keep in sync with theme.css duration

let current = null; // current theme token, for getTheme()
export const getTheme = () => current;

/**
 * PRIMARY source: pull the u-theme-* token from a full document's <body>.
 * Used with Taxi's NAVIGATE_IN entry.page (the fetched incoming document).
 */
export function readThemeFromDocument(doc) {
	const cls = doc?.body?.className || '';
	const m = cls.match(/\bu-theme-(dark|light|brand)\b/);
	return m ? m[1] : null;
}

/**
 * FALLBACK source: explicit data-theme token on the incoming view (self or
 * descendant), mirroring the detectPageName() lookup in transitions/index.js.
 */
export function readTheme(scope) {
	const token =
		scope?.dataset?.theme ||
		scope?.querySelector?.('[data-theme]')?.dataset.theme;
	return THEMES.includes(token) ? token : null;
}

let switchTimer = null;

/**
 * Swap the u-theme-* class on <body>. animate=false on first load (no flash).
 */
export function applyTheme(token, { animate = true } = {}) {
	if (!token) return;
	const body = document.body;
	const next = PREFIX + token;
	if (body.classList.contains(next)) {
		current = token; // already correct, but record it for getTheme()
		return;
	}
	const previous = current;
	if (animate) body.classList.add('is-theme-switching');
	THEMES.forEach((t) => body.classList.remove(PREFIX + t));
	body.classList.add(next);
	current = token;
	// Decoupled signal so anything (components, animations) can follow the
	// theme without this module knowing about them.
	emitter.emit('theme:change', { theme: token, previous, animate });
	if (animate) {
		clearTimeout(switchTimer); // guard rapid navigation
		switchTimer = setTimeout(
			() => body.classList.remove('is-theme-switching'),
			SWITCH_MS,
		);
	}
}

/**
 * Convenience used by the transition hook: read the incoming document's body
 * class and apply it. Falls back to a view-level data-theme token if present.
 */
export function switchThemeFromEntry(entry, opts) {
	const token =
		readThemeFromDocument(entry?.page) || readTheme(entry?.content);
	applyTheme(token, opts);
}

/**
 * Prime `current` from the live <body> at boot so getTheme() is correct before
 * the first navigation.
 */
export function initTheme() {
	current = readThemeFromDocument(document) || current;
}
