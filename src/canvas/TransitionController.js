import { Mesh, PlaneGeometry } from 'three';
import { gsap } from 'gsap';
import emitter from '@utils/Emitter';
import { isMobile } from '@utils/media';
import { lerp } from '@utils/math';

/**
 * TransitionController — primitive engine for cross-page WebGL mesh transitions.
 *
 * Stages a cloned source mesh in the scene on `prepare(mesh, opts)`. The per-page
 * transition class (e.g. ProjectTrans) then calls `getFlightContext(rect)` to grab
 * the mesh + helpers and authors the entire flight on its own GSAP timeline —
 * mesh transform, shader uniforms, and DOM tweens all on the same timeline.
 *
 *   Source page (e.g. Home, on link click):
 *     emitter.emit('webgl:transition:prepare', { mesh, targetUrl, sourcePage });
 *
 *   Destination page transition:
 *     const ctx = this.transitionController.getFlightContext(
 *       to.querySelector('[data-gl-target]').getBoundingClientRect()
 *     );
 *     const tl = gsap.timeline({ onComplete: () => ctx.cleanup() });
 *     tl.to(ctx.mesh.position, { ... }, 0);
 *     tl.to(ctx.uniforms.uPageTransition, { ... }, 0);
 *     // ... DOM, shader extras, whatever.
 *
 * Geometry-agnostic — `getFlightContext()` exposes the raw mesh + uniforms.
 * Plane-style transitions use `sizeProxy` + `onSizeUpdate` for resize + UV
 * correction. 3D-model transitions ignore those and tween `mesh.scale` /
 * `mesh.rotation` / custom uniforms directly.
 */
export class TransitionController {
	constructor(canvas) {
		this.canvas = canvas;
		this.transitionMesh = null;
		this._sourcePlane = null;

		// Source-side hook — any page can emit prepare without canvas ref.
		// Namespaced so destroy() can remove exactly this listener.
		emitter.on(
			'webgl:transition:prepare',
			(data) => {
				if (isMobile()) return;
				if (!data?.mesh) return;
				this.prepare(data.mesh, {
					startPosition: data.startPosition,
					targetUrl: data.targetUrl,
					sourcePage: data.sourcePage,
				});
			},
			'transition-controller',
		);
	}

	destroy() {
		this.cleanup();
		emitter.off(
			'webgl:transition:prepare',
			null,
			'transition-controller',
		);
	}

	/**
	 * Stage a cloned mesh in the scene, hide the original, reset interaction
	 * uniforms. After this returns, the destination page transition calls
	 * `getFlightContext(rect)` and authors the flight on its own timeline.
	 */
	prepare(mesh, opts = {}) {
		if (!mesh) return this;
		if (this.transitionMesh) this.cleanup();
		this._stage(mesh, opts);
		return this;
	}

	/**
	 * Returns the handle the per-page transition uses to script the flight.
	 * `rect` is the destination DOM element's bounding rect (caller queries
	 * it from `to.querySelector('[data-gl-target]')`).
	 *
	 * Returns null when no mesh is staged (no flight prepared) — callers
	 * should fall back to a DOM-only timeline in that case.
	 */
	getFlightContext(rect) {
		if (!this.transitionMesh || !rect) return null;

		const screen = {
			width: window.innerWidth,
			height: window.innerHeight,
		};
		const viewport = this._viewportSize();

		const world = {
			x:
				((rect.left + rect.width / 2) / screen.width) *
					viewport.width -
				viewport.width / 2,
			y:
				viewport.height / 2 -
				((rect.top + rect.height / 2) / screen.height) *
					viewport.height,
			width: (rect.width / screen.width) * viewport.width,
			height: (rect.height / screen.height) * viewport.height,
		};

		const startW =
			this.transitionMesh.geometry.parameters.width *
			this.transitionMesh.scale.x;
		const startH =
			this.transitionMesh.geometry.parameters.height *
			this.transitionMesh.scale.y;
		const sizeProxy = { width: startW, height: startH, progress: 0 };

		const onSizeUpdate = () => {
			const old = this.transitionMesh.geometry;
			this.transitionMesh.geometry = new PlaneGeometry(
				sizeProxy.width,
				sizeProxy.height,
				64,
				64,
			);
			const img = this.transitionMesh.userData.img;
			if (img?.naturalWidth && img?.naturalHeight) {
				this._correctUVs(img, sizeProxy);
			}
			this.transitionMesh.scale.set(1, 1, 1);
			old.dispose();
		};

		return {
			mesh: this.transitionMesh,
			uniforms: this.transitionMesh.material.uniforms,
			sizeProxy,
			onSizeUpdate,
			world,
			cleanup: () => this.cleanup(),
		};
	}

	cleanup() {
		if (!this.transitionMesh) return;
		this.canvas.scene.remove(this.transitionMesh);
		this.transitionMesh.geometry.dispose();
		this.transitionMesh.material.dispose();
		if (this._sourcePlane) this._sourcePlane.visible = true;
		this.transitionMesh = null;
		this._sourcePlane = null;
	}

	// ────────────────────────────────────────────────────────────────────
	// Internals
	// ────────────────────────────────────────────────────────────────────

	_stage(sourcePlane, opts) {
		const { startPosition } = opts;

		const clonedMaterial = sourcePlane.material.clone();
		clonedMaterial.transparent = true;
		clonedMaterial.opacity = 1;

		const srcUniforms = sourcePlane.material.uniforms;
		if (srcUniforms?.uOpacity) {
			gsap.killTweensOf(srcUniforms.uOpacity);
			srcUniforms.uOpacity.value = 1;
		}

		// Clone uniforms by value so authors can mutate ctx.uniforms freely
		// without touching the source mesh's interactive state.
		if (srcUniforms) {
			Object.keys(srcUniforms).forEach((key) => {
				if (!clonedMaterial.uniforms[key]) return;
				const v = srcUniforms[key].value;
				if (v && typeof v === 'object' && v.clone) {
					clonedMaterial.uniforms[key].value = v.clone();
				} else if (v && typeof v === 'object') {
					clonedMaterial.uniforms[key].value = { ...v };
				} else {
					clonedMaterial.uniforms[key].value = v;
				}
			});
		}

		if (clonedMaterial.uniforms.uOpacity) {
			clonedMaterial.uniforms.uOpacity.value = 1;
		}

		// Geometry must be CLONED — cleanup() disposes it, and onSizeUpdate
		// disposes the pre-flight geometry on its first tick. With a shared
		// geometry either path would destroy the live source plane's buffers.
		this.transitionMesh = new Mesh(
			sourcePlane.geometry.clone(),
			clonedMaterial,
		);
		this.transitionMesh.position.copy(sourcePlane.position);
		this.transitionMesh.scale.set(1, 1, 1);
		this.transitionMesh.rotation.copy(sourcePlane.rotation);

		if (
			startPosition &&
			Number.isFinite(startPosition.x) &&
			Number.isFinite(startPosition.y)
		) {
			this.transitionMesh.position.x = startPosition.x;
			this.transitionMesh.position.y = startPosition.y;
		}

		this.transitionMesh.userData = { ...sourcePlane.userData };
		this.canvas.scene.add(this.transitionMesh);
		this.transitionMesh.visible = true;
		sourcePlane.visible = false;
		this._sourcePlane = sourcePlane;

		// Pre-flight interaction reset — opt-in per uniform.
		// Custom shaders without these uniforms get no-ops.
		const u = this.transitionMesh.material.uniforms;
		const prepTl = gsap.timeline();
		if (u?.uOffset?.value) {
			prepTl.to(
				u.uOffset.value,
				{ x: 0, y: 0, duration: 0.1, ease: 'power2.out' },
				0,
			);
		}
		if (u?.uMouseVelocity?.value) {
			prepTl.to(
				u.uMouseVelocity.value,
				{ x: 0, y: 0, duration: 0.5, ease: 'power2.out' },
				0,
			);
		}
		if (u?.uReveal) {
			prepTl.to(
				u.uReveal,
				{ value: 1.0, duration: 0.1, ease: 'power2.out' },
				0,
			);
		}
		if (u?.uPageTransition) {
			u.uPageTransition.value = 0;
		}
	}

	_viewportSize() {
		const cam = this.canvas.camera;
		const fov = cam.fov * (Math.PI / 180);
		const height = 2 * Math.tan(fov / 2) * cam.position.z;
		const width = height * cam.aspect;
		return { width, height };
	}

	_correctUVs(img, sizeProxy) {
		const imgAspect = img.naturalWidth / img.naturalHeight;
		const targetAspect = sizeProxy.width / sizeProxy.height;

		let idealUScale = 1;
		let idealVScale = 1;
		let idealUOffset = 0;
		let idealVOffset = 0;

		if (imgAspect > targetAspect) {
			const visibleU = targetAspect / imgAspect;
			idealUOffset = (1 - visibleU) / 2;
			idealUScale = visibleU;
		} else {
			const visibleV = imgAspect / targetAspect;
			idealVOffset = (1 - visibleV) / 2;
			idealVScale = visibleV;
		}

		const p = sizeProxy.progress;
		const shaderZoom = this.transitionMesh.userData.shaderZoom || 1.0;

		const uOffset = idealUOffset * p;
		const vOffset = idealVOffset * p;
		const uScale = lerp(1, idealUScale, p);
		const vScale = lerp(1, idealVScale, p);

		const startComp = 1.0;
		const endComp = 1.0 / shaderZoom;
		const compensation = lerp(startComp, endComp, p);

		const uvs = this.transitionMesh.geometry.attributes.uv;
		for (let i = 0; i < uvs.count; i++) {
			const u = uvs.getX(i);
			const v = uvs.getY(i);
			let newU = uOffset + u * uScale;
			let newV = vOffset + v * vScale;
			newU = (newU - 0.5) * compensation + 0.5;
			newV = (newV - 0.5) * compensation + 0.5;
			uvs.setXY(i, newU, newV);
		}
		uvs.needsUpdate = true;
	}
}
