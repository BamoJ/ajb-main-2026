import { Page } from '../Page';
import { DOMPlane } from '../DOMPlane';
import { gsap } from 'gsap';
import emitter from '@utils/Emitter';
import { isMobile } from '@utils/media';
import TextureCache from '../utils/TextureCache';
import defaultVert from '../shaders/defaultVert.glsl';
import defaultFrag from '../shaders/defaultFrag.glsl';

/**
 * Example Home page — demonstrates DOMPlane usage with image textures.
 *
 * Queries all [data-gl="img"] elements, creates WebGL planes,
 * and syncs them to the DOM. Hover adds wave/reveal effects.
 *
 * Replace this with your project-specific WebGL experience.
 */
export class Home extends Page {
	constructor(options) {
		super(options);
		this.view = null;
		this.calculateViewport();
	}

	calculateViewport() {
		this.screen = {
			width: window.innerWidth,
			height: window.innerHeight,
		};

		const fov = this.camera.fov * (Math.PI / 180);
		const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
		const width = height * this.camera.aspect;

		this.viewport = { width, height };
	}

	create(template = document) {
		if (this.created) return;

		this._template = template;
		this.calculateViewport();
		this.initView(template);

		this.scene.add(this.elements);
		this.created = true;
		this.emit('create');

		// Signal ready for the Preloader's readySignal (deferred one tick so
		// same-tick listeners can register first). Emitted once per create.
		setTimeout(() => emitter.emit('home:enter-ready'), 0);
	}

	initView(template = document) {
		this.view = new HomeView({
			parent: this.elements,
			camera: this.camera,
			viewport: this.viewport,
			screen: this.screen,
			shaders: {
				vertex: defaultVert,
				fragment: defaultFrag,
			},
			template,
		});
	}

	onEnter(data) {
		// Rebuild only when Taxi handed us a DIFFERENT template than the one
		// the cached view was built against (SPA re-entry swaps the DOM).
		// Rebuilding unconditionally doubled every entry's build cost.
		if (
			this.view &&
			this.created &&
			data &&
			data !== this._template
		) {
			this.view.destroy?.();
			this.view = null;
			this.created = false;
			this.create(data);
		}
		super.onEnter(data);
	}

	/**
	 * Composer-style enter signal: hands the per-page transition class a live
	 * timeline plus tweenable uniform handles ({ value } objects — plain GSAP
	 * targets). The transition composes its choreography onto `timeline`;
	 * if nobody composes, the empty timeline completes immediately.
	 * NOTE: `reveals` may be empty if textures are still loading — compose
	 * defensively (empty arrays no-op in GSAP).
	 */
	transitionIn(onComplete) {
		const timeline = gsap.timeline({
			onComplete: () => onComplete?.(),
		});
		const reveals = (this.view?.imagePlanes || [])
			.map((mesh) => mesh.material.uniforms.uReveal)
			.filter(Boolean);
		emitter.emit('home:intro-started', { timeline, reveals });
	}

	transitionOut(onComplete) {
		if (this.view) {
			this.view.hide();
		}

		setTimeout(() => {
			this.view?.destroy?.();
			this.view = null;
			this.created = false;
			if (onComplete) onComplete();
		}, 1400);
	}

	onResize() {
		this.calculateViewport();
		this.view?.onResize?.(this.viewport, this.screen);
	}

	update(time) {
		if (!this.isActive || !this.view) return;
		this.view.update(time);
	}

	destroy() {
		this.view?.destroy?.();
		super.destroy();
	}
}

/**
 * HomeView — example DOMPlane subclass.
 * Loads [data-gl="img"] images and creates interactive WebGL planes.
 */
class HomeView extends DOMPlane {
	constructor(options) {
		super(options);
		this.template = options.template || document;
		this.loadImages();
	}

	loadImages() {
		const images = Array.from(
			this.template.querySelectorAll('[data-gl="img"]'),
		);

		if (!images.length) return;

		let loaded = 0;
		const uniqueSrcs = new Map();

		images.forEach((img) => {
			const src = img.getAttribute('data-gl-src') || img.src;
			if (!src || uniqueSrcs.has(src)) return;
			uniqueSrcs.set(src, img);
		});

		uniqueSrcs.forEach((img, src) => {
			TextureCache.load(src)
				.then((texture) => {
					this.textures.push({ texture, src });
				})
				.catch((err) =>
					console.error('[HomeView] Texture error:', err),
				)
				.finally(() => {
					// Count failures too — one 404 must not block every
					// other plane from ever being created. Planes whose
					// texture failed are simply skipped in createPlanes.
					loaded++;
					if (loaded === uniqueSrcs.size) {
						this.createPlanes(images);
					}
				});
		});
	}

	createPlanes(images) {
		images.forEach((img, index) => {
			const src = img.getAttribute('data-gl-src') || img.src;
			const texEntry = this.textures.find((t) => t.src === src);
			if (!texEntry) return;

			const mesh = this.createPlane(texEntry.texture, img, index);

			// Flight/intro handles. uReveal stays at DOMPlane's default (1 =
			// visible) — intro choreography can tween it 0→1 via the
			// `home:intro-started` reveals handles.
			mesh.material.uniforms.uPageTransition = { value: 0 };

			// Shader zoom factor for TransitionController UV correction
			mesh.userData.shaderZoom = 0.9;

			this.imagePlanes.push(mesh);
			this.imageGroup.add(mesh);

			this.setupHoverListeners(mesh, img, '[data-gl-container]');

			// Setup click-to-transition handler
			this.setupTransitionHandler(mesh, img);
		});

		// Hide DOM images, show WebGL planes
		this.template
			.querySelectorAll('[data-gl="img"]')
			.forEach((img) => {
				img.style.opacity = '0';
			});

		this.updatePlanesPositions();
	}

	setupTransitionHandler(mesh, img) {
		const link = img
			.closest('[data-gl-container]')
			?.querySelector('a[href]');
		if (!link) return;

		link.addEventListener(
			'click',
			() => {
				if (isMobile()) return;

				emitter.emit('webgl:transition:prepare', {
					mesh,
					targetUrl: link.href,
					sourcePage: 'home',
				});
			},
			{ signal: this.abortController.signal },
		);
	}

	// Hover effects (mouse-follow drift, drag-warp, RGB shift) are driven by
	// updateHoveredPlanes() each frame off the isHovered flag — these hooks
	// only arm/disarm it.
	onHoverEnter(mesh) {
		if (isMobile()) return;
		mesh.userData.isHovered = true;
	}

	onHoverLeave(mesh) {
		if (isMobile()) return;
		mesh.userData.isHovered = false;
	}

	updatePlanesPositions() {
		this.imagePlanes.forEach((plane) => {
			this.updatePlanePosition(plane);
		});
	}

	update({ delta }) {
		this.updatePlanesPositions();
		this.updateHoveredPlanes(delta);
	}
}
