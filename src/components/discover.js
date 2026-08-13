import { runMount, runDestroy } from '@core/hooks';

/**
 * Auto-discover DOM components via [data-component] attribute.
 *
 * Scans every component file under src/components/ (except _core/ + index +
 * discover) at build time using Vite's import.meta.glob. Each module's
 * default export is called with `(element, dataset)` for every DOM node
 * whose [data-component] value matches the file name.
 *
 * To register a component:
 *   1. Create src/components/menu/menu.js exporting a default function
 *   2. Add data-component="menu" on a Webflow element
 *   3. Done — no manual import, no manual instantiation
 *
 * The component function may register cleanup via @core/hooks `onDestroy`.
 * Calling `runDestroy()` on page leave tears everything down.
 */

const modules = import.meta.glob(
	'./!(index|discover|_core)/**/*.js',
	{ eager: true },
);

// Map each file path to its filename (without .js).
//   './menu/menu.js' → 'menu'
//   './nav/MainNav.js' → 'mainnav' (lowercased)
const registry = {};
for (const [path, mod] of Object.entries(modules)) {
	const match = path.match(/\/([^/]+)\.js$/);
	if (!match) continue;
	const name = match[1].toLowerCase();
	if (typeof mod.default === 'function') {
		registry[name] = mod.default;
	}
}

const INIT_FLAG = '_componentInitialized';

export function discoverComponents(scope = document) {
	const elements = scope.querySelectorAll('[data-component]');
	elements.forEach((el) => {
		if (el[INIT_FLAG]) return;
		const name = (el.dataset.component || '').toLowerCase();
		const fn = registry[name];
		if (!fn) {
			console.warn(`[components] No module for [data-component="${name}"]`);
			return;
		}
		try {
			fn(el, el.dataset);
			el[INIT_FLAG] = true;
		} catch (err) {
			console.error(`[components] ${name} failed:`, err);
		}
	});

	runMount();
}

export function destroyComponents() {
	runDestroy();
	// Clear init flags so re-discovery on the same DOM (rare) works.
	document
		.querySelectorAll('[data-component]')
		.forEach((el) => {
			el[INIT_FLAG] = false;
		});
}
