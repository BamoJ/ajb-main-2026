/**
 * Enriched getBoundingClientRect — adds viewport dims, doc-space offset,
 * and centroid coordinates. Removes the boilerplate around DOMPlane and
 * scroll-driven layout math.
 *
 *   const r = clientRect(el)
 *   r.top, r.bottom, r.left, r.right    // viewport-relative
 *   r.width, r.height                   // element size
 *   r.wh, r.ww                          // window inner dims
 *   r.offset                            // r.top + scrollY (doc-space)
 *   r.centerx, r.centery                // viewport-space center
 */
export function clientRect(element) {
	const rect = element.getBoundingClientRect();
	const wh = window.innerHeight;
	const ww = window.innerWidth;
	return {
		top: rect.top,
		bottom: rect.bottom,
		left: rect.left,
		right: rect.right,
		width: rect.width,
		height: rect.height,
		wh,
		ww,
		offset: rect.top + window.scrollY,
		centery: rect.top + rect.height / 2,
		centerx: rect.left + rect.width / 2,
	};
}
