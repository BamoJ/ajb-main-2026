import { gsap } from 'gsap';
import emitter from '@utils/Emitter';
import { clamp } from '@utils/math';

/**
 * Preloader — tracks real loading progress and orchestrates page enter.
 *
 * Customize the DOM selectors and animations per project.
 * The loading logic (texture preloading, progress tracking) stays the same.
 *
 * Optional Webflow elements (the DOM overlay flavor):
 *   [data-loader="wrapper"]     - Preloader container
 *   [data-loader="loader-num"]  - Progress number display
 *   [data-loader="progress-bar"] - Progress bar element
 *
 * Without a wrapper the DOM bits are skipped and progress is reported only
 * via `onProgress(0..1)` — e.g. to drive a WebGL loading visual. `onProgress`
 * reports the EASED display progress and never forces 1; the host finishes
 * the last stretch itself.
 *
 * Asset loading is injectable via `loadAssets(onProgress)`. Default uses
 * browser-native Image preloading so DOM-only projects don't pull in WebGL.
 * For WebGL projects, pass `textureLoadAssets` from `@core/boot`.
 */
export default class Preloader {
	constructor(options = {}) {
		this.onComplete = options.onComplete || (() => {});
		this.onAppStart = options.onAppStart || (() => {});
		this.onProgress = options.onProgress || null;
		this.minDuration = options.minDuration || 400;
		this._loadAssets = options.loadAssets || null;

		this.wrapper = document.querySelector('[data-loader="wrapper"]');

		this.loaderNum =
			this.wrapper?.querySelector('[data-loader="loader-num"]') ??
			null;
		this.progressBar =
			this.wrapper?.querySelector('[data-loader="progress-bar"]') ??
			null;

		this.actualProgress = 0;
		this.displayProgress = 0;
		this.loadingComplete = false;
		this.rafId = null;
		this.isComplete = false;
		this.startTime = 0;
		this.appStarted = false;

		// Page-specific ready signal name (e.g. 'home:enter-ready')
		this.readySignal = options.readySignal || null;
		this.readyTimeout = options.readyTimeout || 2000;
		this.readyFired = false;

		if (this.readySignal) {
			emitter.once(this.readySignal, () => {
				this.readyFired = true;
			});
		}
	}

	startProgressTicker() {
		const tick = () => {
			if (this.isComplete) return;

			const elapsed = performance.now() - this.startTime;
			const timeProgress = clamp(
				(elapsed / this.minDuration) * 100,
				0,
				100,
			);

			const target = this.loadingComplete
				? timeProgress
				: Math.min(timeProgress, this.actualProgress);

			this.displayProgress += (target - this.displayProgress) * 0.06;

			const current = Math.round(this.displayProgress);
			if (this.loaderNum) {
				this.loaderNum.textContent = current;
			}
			if (this.progressBar) {
				this.progressBar.style.width = `${current}%`;
			}
			this.onProgress?.(this.displayProgress / 100);

			this.rafId = requestAnimationFrame(tick);
		};

		this.rafId = requestAnimationFrame(tick);
	}

	stopProgressTicker() {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	async start() {
		if (this.wrapper) this.wrapper.style.visibility = 'visible';
		this.startTime = performance.now();

		this.startProgressTicker();

		await this.loadAssets();

		// Start the app
		await new Promise((r) => setTimeout(r, 100));
		this.onAppStart();
		this.appStarted = true;

		// Wait for page-specific ready signal if configured
		if (this.readySignal) {
			await this.waitForPageReady();
		}

		this.loadingComplete = true;
		this.actualProgress = 100;

		const elapsed = performance.now() - this.startTime;
		const remaining = Math.max(this.minDuration - elapsed, 0);
		if (remaining > 0) {
			await new Promise((r) => setTimeout(r, remaining));
		}

		await new Promise((r) => setTimeout(r, 150));
		this.stopProgressTicker();
		await this.complete();
	}

	async complete() {
		if (this.isComplete) return;
		this.isComplete = true;

		this.displayProgress = 100;
		if (this.loaderNum) this.loaderNum.textContent = '100';
		if (this.progressBar) this.progressBar.style.width = '100%';

		await new Promise((r) => setTimeout(r, 100));
		await this.animateOut();
	}

	async loadAssets() {
		const onProgress = (p) => {
			this.actualProgress = p;
		};
		if (this._loadAssets) {
			await this._loadAssets(onProgress);
			return;
		}
		await this._defaultLoadAssets(onProgress);
	}

	_defaultLoadAssets(onProgress) {
		const images = [...document.querySelectorAll('img[src]')];
		const total = images.length;
		if (total === 0) {
			onProgress(95);
			return Promise.resolve();
		}
		let loaded = 0;
		return Promise.all(
			images.map(
				(img) =>
					new Promise((resolve) => {
						const i = new Image();
						i.onload = i.onerror = () => {
							onProgress((++loaded / total) * 95);
							resolve();
						};
						i.src = img.src;
					}),
			),
		).then(() => onProgress(95));
	}

	waitForPageReady() {
		return new Promise((resolve) => {
			if (this.readyFired) {
				resolve();
				return;
			}

			emitter.once(this.readySignal, () => {
				this.readyFired = true;
				resolve();
			});

			setTimeout(() => {
				if (!this.readyFired) {
					console.warn(
						`[Preloader] Timeout waiting for ${this.readySignal}`,
					);
					resolve();
				}
			}, this.readyTimeout);
		});
	}

	/**
	 * Override this per project for custom exit animations.
	 */
	animateOut() {
		if (!this.wrapper) return Promise.resolve();
		return new Promise((resolve) => {
			const tl = gsap.timeline({
				onComplete: () => {
					this.wrapper.style.visibility = 'hidden';
					resolve();
				},
			});

			tl.to(this.wrapper, {
				opacity: 0,
				duration: 0.6,
				ease: 'power2.inOut',
			});
		});
	}
}
