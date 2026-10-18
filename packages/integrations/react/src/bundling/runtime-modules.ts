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
	  };

export type ResolvedReactPluginRuntimeModule = {
	specifier: string;
	outputName: string;
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
			};
		}

		return {
			specifier: entry.specifier,
			outputName: entry.outputName ?? resolveReactPluginRuntimeModuleSlug(entry.specifier),
		};
	});
}
