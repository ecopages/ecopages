import type { EcoComponent } from '../../types/public-types.ts';

type ComponentReferenceState = {
	runtimeComponentRefs: WeakMap<EcoComponent, string>;
	nextRuntimeComponentRef: number;
};

const GLOBAL_COMPONENT_REFERENCE_STATE_KEY = '__ECOPAGES_COMPONENT_REFERENCE_STATE__';

function getSharedReferenceScope(): Record<string, unknown> {
	const globalProcess = globalThis.process as (NodeJS.Process & Record<string, unknown>) | undefined;
	if (globalProcess && typeof globalProcess === 'object') {
		return globalProcess;
	}

	return globalThis as Record<string, unknown>;
}

function getComponentReferenceState(): ComponentReferenceState {
	const sharedScope = getSharedReferenceScope() as typeof globalThis & {
		__ECOPAGES_COMPONENT_REFERENCE_STATE__?: ComponentReferenceState;
	};

	sharedScope[GLOBAL_COMPONENT_REFERENCE_STATE_KEY] ??= {
		runtimeComponentRefs: new WeakMap<EcoComponent, string>(),
		nextRuntimeComponentRef: 0,
	};

	return sharedScope[GLOBAL_COMPONENT_REFERENCE_STATE_KEY];
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
	const state = getComponentReferenceState();
	const metadataRef = component.config?.__eco?.id ?? component.config?.__eco?.file;
	if (metadataRef) {
		return metadataRef;
	}

	const existingRef = state.runtimeComponentRefs.get(component);
	if (existingRef) {
		return existingRef;
	}

	state.nextRuntimeComponentRef += 1;
	const runtimeRef = `eco-runtime-component-${state.nextRuntimeComponentRef}`;
	state.runtimeComponentRefs.set(component, runtimeRef);
	return runtimeRef;
}
