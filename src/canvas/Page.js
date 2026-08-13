import { Group } from 'three';
import { Emitter } from '@utils/Emitter';

/**
 * Base class for all WebGL pages.
 *
 * Every page (Home, Project, About, etc.) extends this.
 * Provides lifecycle hooks, scene management, and transition support.
 *
 * For pages that need DOM-mapped WebGL planes, use DOMPlane as a helper.
 * For pages with raw 3D scenes (particles, etc.), work with this.scene directly.
 */
export class Page extends Emitter {
	constructor({ scene, camera, renderer, time }) {
		super();

		this.scene = scene;
		this.camera = camera;
		this.renderer = renderer;
		this.time = time;
		this.elements = new Group();
		this.elements.visible = false;
		this.isActive = false;
		this.created = false;
	}

	async load() {}

	create() {
		if (this.created) return;
		this.createGeometry?.();
		this.createMaterials?.();
		this.createMeshes?.();
		this.scene.add(this.elements);
		this.created = true;
		this.emit('create');
	}

	onEnter(data) {
		this.elements.visible = true;
		this.isActive = true;
		this.isTransitioning = true;

		this.transitionIn(() => {
			this.isTransitioning = false;
		});
		this.emit('enter', data);
	}

	onLeave(data) {
		this.isTransitioning = true;

		this.transitionOut(() => {
			this.elements.visible = false;
			this.isActive = false;
			this.isTransitioning = false;
		});

		this.emit('leave', data);
	}

	transitionIn(onComplete) {
		onComplete();
	}

	transitionOut(onComplete) {
		if (onComplete) onComplete();
	}

	onResize() {}

	update() {
		if (!this.isActive) return;
	}

	destroy() {
		this.elements.traverse((child) => {
			if (child.geometry) child.geometry.dispose();
			if (child.material) {
				if (Array.isArray(child.material)) {
					child.material.forEach((m) => {
						m.map?.dispose();
						m.dispose();
					});
				} else {
					child.material.map?.dispose();
					child.material.dispose();
				}
			}
		});

		this.scene.remove(this.elements);
		this.emit('destroy');
	}
}
