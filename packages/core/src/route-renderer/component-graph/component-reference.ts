import type { EcoComponent } from '../../types/public-types.ts';
import { rapidhash } from '../../utils/hash.ts';

const runtimeComponentRefs = new WeakMap<EcoComponent, string>();
const runtimeComponentHints = new WeakMap<EcoComponent, string>();
const runtimeComponentHintSymbol = Symbol.for('ecopages.runtimeComponentHint');
let nextRuntimeComponentRef = 0;

export function registerRuntimeComponentHint(component: EcoComponent, hint: string): void {
	runtimeComponentHints.set(component, hint);
	(component as EcoComponent & { [runtimeComponentHintSymbol]?: string })[runtimeComponentHintSymbol] = hint;
}

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

	const runtimeHint = runtimeComponentHints.get(component);
	if (runtimeHint) {
		const hintedRef = `eco-runtime-component-${rapidhash(runtimeHint).toString(36)}`;
		runtimeComponentRefs.set(component, hintedRef);
		return hintedRef;
	}

	const componentHint = (component as EcoComponent & { [runtimeComponentHintSymbol]?: string })[
		runtimeComponentHintSymbol
	];
	if (componentHint) {
		const hintedRef = `eco-runtime-component-${rapidhash(componentHint).toString(36)}`;
		runtimeComponentRefs.set(component, hintedRef);
		return hintedRef;
	}

	nextRuntimeComponentRef += 1;
	const runtimeRef = `eco-runtime-component-${nextRuntimeComponentRef}`;
	runtimeComponentRefs.set(component, runtimeRef);
	return runtimeRef;
}
