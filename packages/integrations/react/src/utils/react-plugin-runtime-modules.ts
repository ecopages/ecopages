/**
 * Normalizes `reactPlugin({ runtimeModules })` entries for vendor bundling.
 *
 * @module
 */

export type ReactPluginRuntimeModule =
	| string
	| {
			specifier: string;
			outputName?: string;
			externals?: string[];
	  };

export type ResolvedReactPluginRuntimeModule = {
	specifier: string;
	outputName: string;
	externals: string[];
};

/**
 * Builds a stable vendor filename stem from a package specifier.
 */
export function resolveReactPluginRuntimeModuleSlug(specifier: string): string {
	return specifier.replace(/^@/, '').replace(/\//g, '-');
}

/**
 * Resolves user-facing runtime module declarations into vendor bundle config.
 */
export function resolveReactPluginRuntimeModules(
	modules: ReactPluginRuntimeModule[] | undefined,
): ResolvedReactPluginRuntimeModule[] {
	return (modules ?? []).map((entry) => {
		if (typeof entry === 'string') {
			return {
				specifier: entry,
				outputName: resolveReactPluginRuntimeModuleSlug(entry),
				externals: [],
			};
		}

		return {
			specifier: entry.specifier,
			outputName: entry.outputName ?? resolveReactPluginRuntimeModuleSlug(entry.specifier),
			externals: entry.externals ?? [],
		};
	});
}

/**
 * Merges auto-discovered layout npm imports with explicit `runtimeModules` entries.
 *
 * @remarks Manual entries win when both sources declare the same specifier.
 */
export function mergeReactPluginRuntimeModules(
	manualModules: ResolvedReactPluginRuntimeModule[],
	autoSpecifiers: string[],
): ResolvedReactPluginRuntimeModule[] {
	const merged = new Map<string, ResolvedReactPluginRuntimeModule>();

	for (const specifier of autoSpecifiers) {
		merged.set(specifier, {
			specifier,
			outputName: resolveReactPluginRuntimeModuleSlug(specifier),
			externals: [],
		});
	}

	for (const entry of manualModules) {
		merged.set(entry.specifier, entry);
	}

	return [...merged.values()];
}
