import {
	discoverComponents,
	destroyComponents,
} from './discover';

/**
 * Component manager — thin wrapper around the auto-discovery system.
 *
 * Usage:
 *   - Add `data-component="menu"` to a Webflow element.
 *   - Create `src/components/menu/menu.js` with a default-exported function.
 *   - The function receives `(element, dataset)` and may call
 *     `onMount(fn)` / `onDestroy(fn)` from `@core/hooks` for cleanup.
 *
 * Stateful components can still extend `ComponentCore` and export a factory:
 *   import Menu from './Menu'
 *   export default function (el, dataset) {
 *     const menu = new Menu(el)
 *     menu.init()
 *     onDestroy(() => menu.destroy())
 *   }
 */
export default class Components {
	constructor() {
		discoverComponents();
	}

	destroy() {
		destroyComponents();
	}
}
