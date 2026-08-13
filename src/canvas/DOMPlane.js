import {
	PlaneGeometry,
	ShaderMaterial,
	Mesh,
	TextureLoader,
	Group,
} from 'three';
import { clientRect } from '@utils/client-rect';
import { lerp } from '@utils/math';

/**
 * DOMPlane — maps DOM elements (images, videos) to WebGL planes.
 *
 * Handles:
 * - Creating a PlaneGeometry sized to match the DOM element
 * - Converting DOM pixel coordinates → WebGL world units
 * - Syncing plane position to DOM element every frame (scroll, layout)
 * - Mouse hover interaction (enter/leave/move with velocity tracking)
 * - Resize: recreates geometry to match new DOM dimensions
 * - Cleanup via AbortController
 *
 * Usage:
 *   class MyView extends DOMPlane {
 *     constructor(options) {
 *       super({ ...options, shaders: { vertex: vert, fragment: frag } });
 *     }
 *     onHoverEnter(mesh) { // animate uniforms }
 *     onHoverLeave(mesh) { // animate uniforms }
 *   }
 *
 * Works with any DOM element that has a bounding rect — <img>, <video>, <div>, etc.
 */
export class DOMPlane {
	constructor({ parent, camera, viewport, screen, shaders }) {
		this.parent = parent;
		this.camera = camera;
		this.viewport = viewport;
		this.screen = screen;
		this.shaders = shaders;

		this.textures = [];
		this.imagePlanes = [];
		this.textureLoader = new TextureLoader();
		this.imageGroup = new Group();
		this.parent.add(this.imageGroup);

		this.abortController = new AbortController();
	}

	/**
	 * Create a WebGL plane mapped to a DOM element.
	 * @param {THREE.Texture} texture - Any texture (image, video, canvas, data)
	 * @param {HTMLElement} el - The DOM element to map (needs getBoundingClientRect)
	 * @param {number} index - Index for ordering/identification
	 * @returns {THREE.Mesh}
	 */
	createPlane(texture, el, index) {
		const bounds = clientRect(el);

		const width =
			(bounds.width / this.screen.width) * this.viewport.width;
		const height =
			(bounds.height / this.screen.height) * this.viewport.height;

		const geometry = new PlaneGeometry(width, height, 32, 32);

		const material = new ShaderMaterial({
			vertexShader: this.shaders.vertex,
			fragmentShader: this.shaders.fragment,
			transparent: true,
			uniforms: {
				uTexture: { value: texture },
				uOpacity: { value: 1 },
				uOffset: { value: { x: 0, y: 0 } },
				uMouseVelocity: { value: { x: 0, y: 0 } },
				uReveal: { value: 1 },
			},
		});

		const mesh = new Mesh(geometry, material);
		mesh.userData = {
			index,
			img: el,
			bounds,
			isHovered: false,
			mousePos: { x: 0, y: 0 },
			targetMouseUV: { x: 0, y: 0 },
			targetWorldPos: { x: 0, y: 0 },
			worldPos: null,
		};

		return mesh;
	}

	/**
	 * Attach hover listeners to a container around the DOM element.
	 * @param {THREE.Mesh} mesh - The WebGL plane
	 * @param {HTMLElement} el - The DOM element
	 * @param {string} containerSelector - Parent selector for hover area
	 */
	setupHoverListeners(mesh, el, containerSelector) {
		const container = el.closest(containerSelector);
		if (!container) return;

		container.addEventListener(
			'mouseenter',
			() => this.onHoverEnter(mesh),
			{ signal: this.abortController.signal },
		);

		container.addEventListener(
			'mouseleave',
			() => this.onHoverLeave(mesh),
			{ signal: this.abortController.signal },
		);

		container.addEventListener(
			'mousemove',
			(e) => {
				if (!mesh.userData.isHovered) return;

				const bounds = clientRect(container);

				mesh.userData.targetMouseUV = {
					x: ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
					y: -((e.clientY - bounds.top) / bounds.height) * 2 + 1,
				};

				const worldX =
					(e.clientX / this.screen.width) * this.viewport.width -
					this.viewport.width / 2;
				const worldY =
					this.viewport.height / 2 -
					(e.clientY / this.screen.height) * this.viewport.height;

				mesh.userData.targetWorldPos = {
					x: worldX,
					y: worldY,
				};
			},
			{ signal: this.abortController.signal },
		);
	}

	// Override in subclasses for hover effects
	onHoverEnter(mesh) {}
	onHoverLeave(mesh) {}

	/**
	 * Sync a single plane to its DOM element position.
	 */
	updatePlanePosition(plane) {
		if (plane.userData.worldPos) return;

		const { img } = plane.userData;
		const bounds = clientRect(img);

		if (bounds.width === 0 || bounds.height === 0) return;

		const x = this.updateX(bounds.left, bounds.width);
		const y = this.updateY(bounds.top, bounds.height);

		plane.position.set(x, y, 0);
	}

	// DOM pixel → WebGL world X
	updateX(left, width) {
		return (
			((left + width / 2) / this.screen.width) * this.viewport.width -
			this.viewport.width / 2
		);
	}

	// DOM pixel → WebGL world Y
	updateY(top, height) {
		return (
			this.viewport.height / 2 -
			((top + height / 2) / this.screen.height) * this.viewport.height
		);
	}

	/**
	 * Per-frame update: hover follow easing + velocity uniforms.
	 */
	updateHoveredPlanes(delta) {
		this.imagePlanes.forEach((plane) => {
			if (plane.userData.isHovered) {
				const currentWorld = plane.userData.worldPos || {
					x: plane.position.x,
					y: plane.position.y,
				};
				const targetWorld = plane.userData.targetWorldPos;

				const ease = 0.09;
				currentWorld.x = lerp(currentWorld.x, targetWorld.x, ease);
				currentWorld.y = lerp(currentWorld.y, targetWorld.y, ease);

				plane.userData.worldPos = currentWorld;
				plane.position.x = currentWorld.x;
				plane.position.y = currentWorld.y;

				const velocityX = targetWorld.x - currentWorld.x;
				const velocityY = targetWorld.y - currentWorld.y;

				plane.material.uniforms.uOffset.value = {
					x: velocityX * 0.2,
					y: velocityY * 0.3,
				};

				plane.material.uniforms.uMouseVelocity.value = {
					x: velocityX / this.viewport.width,
					y: velocityY / this.viewport.height,
				};
			} else {
				// Release the hover-follow position so updatePlanePosition's
				// DOM tracking takes over again — without this the plane
				// freezes at its last hover spot for the rest of the page.
				plane.userData.worldPos = null;
				plane.material.uniforms.uOffset.value = {
					x: 0,
					y: 0,
				};
				plane.material.uniforms.uMouseVelocity.value = {
					x: 0,
					y: 0,
				};
			}
		});
	}

	onResize(viewport, screen) {
		this.viewport = viewport;
		this.screen = screen;

		if (this.imagePlanes.length) {
			this.imagePlanes.forEach((plane) => {
				const { img } = plane.userData;
				const bounds = clientRect(img);

				const width =
					(bounds.width / this.screen.width) * this.viewport.width;
				const height =
					(bounds.height / this.screen.height) * this.viewport.height;

				plane.geometry.dispose();
				plane.geometry = new PlaneGeometry(width, height, 32, 32);
			});
		}
	}

	show() {
		this.imageGroup.visible = true;
	}

	hide() {
		this.imageGroup.visible = false;
	}

	destroy() {
		this.abortController.abort();

		this.imagePlanes.forEach((plane) => {
			plane.geometry.dispose();
			plane.material.dispose();
		});
		this.parent.remove(this.imageGroup);
	}
}
