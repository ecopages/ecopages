export type CustomElementScriptPreloadScopeState = {
	activeRegistry?: CustomElementRegistry;
	preloadedScripts: Set<string>;
	preloadFailedScripts: Set<string>;
	inFlightImports: Map<string, Promise<void>>;
};

export function getCustomElementScriptPreloadScopeState(
	scopeStates: Map<string, CustomElementScriptPreloadScopeState>,
	cacheScope: string,
): CustomElementScriptPreloadScopeState {
	let state = scopeStates.get(cacheScope);
	if (!state) {
		state = {
			preloadedScripts: new Set(),
			preloadFailedScripts: new Set(),
			inFlightImports: new Map(),
		};
		scopeStates.set(cacheScope, state);
	}
	return state;
}

export function invalidateCustomElementScriptPreload(
	scopeStates: Map<string, CustomElementScriptPreloadScopeState>,
	scriptPath: string,
	cacheScope?: string,
): void {
	const scopes = cacheScope ? [cacheScope] : [...scopeStates.keys()];
	for (const scope of scopes) {
		const state = scopeStates.get(scope);
		if (!state) {
			continue;
		}
		state.preloadedScripts.delete(scriptPath);
		state.preloadFailedScripts.delete(scriptPath);
		state.inFlightImports.delete(scriptPath);
	}
}

/**
 * Forgets every script that failed to preload, so the next render evaluates each of them again.
 *
 * @remarks
 * A script fails because of its own source or any module it imports, so no single file change names the scripts to
 * retry. Development calls it on every change batch; a script that still fails is reported again by that retry.
 */
export function clearFailedCustomElementScriptPreloads(
	scopeStates: Map<string, CustomElementScriptPreloadScopeState>,
): void {
	for (const state of scopeStates.values()) {
		state.preloadFailedScripts.clear();
	}
}
