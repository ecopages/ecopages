export type CustomElementScriptPreloadScopeState = {
	activeRegistry?: CustomElementRegistry;
	preloadedScripts: Set<string>;
	/** The error each script that failed to preload threw, until the script is invalidated. */
	preloadFailedScripts: Map<string, unknown>;
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
			preloadFailedScripts: new Map(),
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
