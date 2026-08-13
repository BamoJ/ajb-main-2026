// Marks the nav link matching the current page with `is-active` so its
// data-underline stays shown (underline.css). Call on load + every NAVIGATE_IN
// (by then Taxi has already pushed the new URL, so location.pathname is current).
export function updateActiveNav() {
	const norm = (p) => p.replace(/\/+$/, '') || '/';
	const path = norm(window.location.pathname);
	document.querySelectorAll('a[data-nav-link]').forEach((link) => {
		link.classList.toggle(
			'is-active',
			norm(new URL(link.href, window.location.origin).pathname) ===
				path,
		);
	});
}
