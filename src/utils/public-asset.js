/**
 * Resolves an asset path against `__PUBLIC_ASSET_ORIGIN__` (set via Vite
 * `define` in vite.config.js). Used when the JS bundle and its assets
 * are hosted on different origins — e.g. JS on Vercel, HTML on Webflow.
 *
 *   - Absolute URLs (`http://`, `https://`, `data:`, `blob:`) pass through.
 *   - If `__PUBLIC_ASSET_ORIGIN__` is empty, returns `src` unchanged.
 *   - Otherwise prefixes the origin and normalizes a single slash join.
 */
export function publicAssetUrl(src) {
	if (!src) return src;
	if (/^(https?:|data:|blob:)/i.test(src)) return src;
	const origin =
		typeof __PUBLIC_ASSET_ORIGIN__ === 'string'
			? __PUBLIC_ASSET_ORIGIN__
			: '';
	if (!origin) return src;
	return origin.replace(/\/+$/, '') + '/' + src.replace(/^\/+/, '');
}
