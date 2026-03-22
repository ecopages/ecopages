import type { EcoComponent } from '../../public-types.ts';

const runtimeComponentRefs = new WeakMap<EcoComponent, string>();
let nextRuntimeComponentRef = 0;

/**
 * Resolves a stable component reference for marker emission and lookup.
 *
 * Build-time metadata remains the preferred source. When a component is
 * imported directly from source on the server and metadata has not been
 * injected, fall back to a process-local stable runtime reference so explicit
 * request-time rendering can still resolve deferred boundaries.
 */
export function getComponentReference(component: EcoComponent): string {
	const metadataRef = component.config?.__eco?.id ?? component.config?.__eco?.file;
	if (metadataRef) {
		return metadataRef;
	}

	const existingRef = runtimeComponentRefs.get(component);
	if (existingRef) {
		return existingRef;
	}

	nextRuntimeComponentRef += 1;
	const runtimeRef = `eco-runtime-component-${nextRuntimeComponentRef}`;
	runtimeComponentRefs.set(component, runtimeRef);
	return runtimeRef;
}
