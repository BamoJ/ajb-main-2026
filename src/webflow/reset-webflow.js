/**
 * Reinitializes Webflow's native JS (forms, tabs, sliders, dropdowns).
 * Call after Taxi swaps the DOM so Webflow re-binds handlers to the new view.
 */
export function resetWebflow() {
	const webflow = window.Webflow || [];
	if (webflow.length > 0) {
		webflow.forEach((wf) => {
			wf.destroy();
			wf.ready();
		});
	}
}
