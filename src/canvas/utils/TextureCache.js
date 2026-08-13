import { TextureLoader } from 'three';
import { publicAssetUrl } from '@utils/public-asset';

class TextureCache {
	constructor() {
		this.cache = new Map();
		this.loader = new TextureLoader();
		this.pending = new Map();
	}

	/**
	 * Load a texture or return cached version. Relative paths are
	 * resolved against `__PUBLIC_ASSET_ORIGIN__` (Vite define).
	 * @param {string} src - Image/video URL
	 * @returns {Promise<THREE.Texture>}
	 */
	load(src) {
		if (!src) return Promise.reject(new Error('No source provided'));

		const url = publicAssetUrl(src);

		if (this.cache.has(url)) {
			return Promise.resolve(this.cache.get(url));
		}

		if (this.pending.has(url)) {
			return this.pending.get(url);
		}

		const promise = new Promise((resolve, reject) => {
			this.loader.load(
				url,
				(texture) => {
					this.cache.set(url, texture);
					this.pending.delete(url);
					resolve(texture);
				},
				undefined,
				(err) => {
					console.error(
						`[TextureCache] Failed to load ${url}`,
						err,
					);
					this.pending.delete(url);
					reject(err);
				},
			);
		});

		this.pending.set(url, promise);
		return promise;
	}

	get(src) {
		return this.cache.get(src);
	}

	has(src) {
		return this.cache.has(src);
	}

	clear() {
		this.cache.forEach((texture) => texture.dispose());
		this.cache.clear();
		this.pending.clear();
	}
}

export default new TextureCache();
