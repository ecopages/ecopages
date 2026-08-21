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
			/**
			 * Packages left unbundled in this vendor chunk.
			 *
			 * @remarks
			 * Each entry must already be a shared vendor — React, the router bundle, or
			 * another `runtimeModules` specifier — so import rewrite can emit
			 * `/assets/vendors/*.js`. Unmapped externals throw at plugin setup.
			 */
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

/**
 * Thrown when a `runtimeModules` entry lists an `externals` specifier that is
 * not a shared browser vendor.
 */
export class UnmappedReactRuntimeModuleExternalError extends Error {
	readonly moduleSpecifier: string;
	readonly unmappedExternals: string[];

	constructor(moduleSpecifier: string, unmappedExternals: string[]) {
		super(
			`reactPlugin runtimeModules entry "${moduleSpecifier}" lists externals that are not shared vendors: ${unmappedExternals.join(', ')}. ` +
				'Register each as its own runtimeModules entry (React and the router bundle are already vendored) so browser imports rewrite to /assets/vendors/*.js.',
		);
		this.name = 'UnmappedReactRuntimeModuleExternalError';
		this.moduleSpecifier = moduleSpecifier;
		this.unmappedExternals = unmappedExternals;
	}
}

/**
 * Ensures every `externals` specifier on a runtime module is already a vendor.
 */
export function assertReactRuntimeModuleExternalsAreVendored(
	module: ResolvedReactPluginRuntimeModule,
	vendoredSpecifiers: ReadonlySet<string>,
): void {
	const unmappedExternals = module.externals.filter((external) => !vendoredSpecifiers.has(external));
	if (unmappedExternals.length === 0) {
		return;
	}

	throw new UnmappedReactRuntimeModuleExternalError(module.specifier, unmappedExternals);
}
