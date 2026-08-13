/**
 * Returns true if the user has requested reduced motion at the OS level.
 */
export function prefersReducedMotion() {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Returns true if the viewport is tablet-or-below (<=1024px).
 */
export function isTabletOrBelow() {
	return window.matchMedia('(max-width: 1024px)').matches;
}

/**
 * Returns true on mobile devices, detected via UA sniffing + viewport width.
 */
export function isMobile() {
	const ua = navigator.userAgent || navigator.vendor || window.opera || '';
	const uaMatch =
		/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
			ua,
		);
	const widthMatch = window.matchMedia('(max-width: 768px)').matches;
	return uaMatch || widthMatch;
}
