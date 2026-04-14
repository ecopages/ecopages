import path from 'node:path';

/**
 * React-only cache for page metadata that HMR rebuilds need during development.
 *
 * This keeps React Fast Refresh optimizations local to the React integration so
 * core HMR interfaces do not need React-specific metadata hooks.
 */
export class ReactHmrPageMetadataCache {
	private readonly declaredModulesByEntrypoint = new Map<string, string[]>();
	private readonly ownedEntrypoints = new Set<string>();

	/**
	 * Marks an HMR entrypoint as React-owned.
	 */
	markOwnedEntrypoint(entrypointPath: string): void {
		this.ownedEntrypoints.add(path.resolve(entrypointPath));
	}

	/**
	 * Stores the declared browser modules for a page entrypoint.
	 */
	setDeclaredModules(entrypointPath: string, declaredModules: string[]): void {
		const resolvedEntrypointPath = path.resolve(entrypointPath);
		this.markOwnedEntrypoint(resolvedEntrypointPath);
		this.declaredModulesByEntrypoint.set(resolvedEntrypointPath, [...declaredModules]);
	}

	/**
	 * Returns the last known declared browser modules for a page entrypoint.
	 */
	getDeclaredModules(entrypointPath: string): string[] | undefined {
		const declaredModules = this.declaredModulesByEntrypoint.get(path.resolve(entrypointPath));
		return declaredModules ? [...declaredModules] : undefined;
	}

	/**
	 * Returns true when the watched entrypoint is owned by the React integration.
	 */
	ownsEntrypoint(entrypointPath: string): boolean {
		return this.ownedEntrypoints.has(path.resolve(entrypointPath));
	}
}
