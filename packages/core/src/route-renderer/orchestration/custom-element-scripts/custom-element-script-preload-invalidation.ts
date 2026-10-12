type ScopePreloadState = {
	activeRegistry?: CustomElementRegistry;
	preloadedScripts: Set<string>;
	preloadFailedScripts: Set<string>;
	inFlightImports: Map<string, Promise<void>>;
};

const scopeStates = new Map<string, ScopePreloadState>();

export function getCustomElementScriptPreloadScopeState(cacheScope: string): ScopePreloadState {
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

export function invalidateCustomElementScriptPreload(scriptPath: string, cacheScope?: string): void {
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
