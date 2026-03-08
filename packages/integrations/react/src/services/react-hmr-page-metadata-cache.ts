/**
 * React-only cache for page metadata that HMR rebuilds need during development.
 *
 * This keeps React Fast Refresh optimizations local to the React integration so
 * core HMR interfaces do not need React-specific metadata hooks.
 */
export class ReactHmrPageMetadataCache {
	private readonly declaredModulesByEntrypoint = new Map<string, string[]>();

	/**
	 * Stores the declared browser modules for a page entrypoint.
	 */
	setDeclaredModules(entrypointPath: string, declaredModules: string[]): void {
		this.declaredModulesByEntrypoint.set(entrypointPath, [...declaredModules]);
	}

	/**
	 * Returns the last known declared browser modules for a page entrypoint.
	 */
	getDeclaredModules(entrypointPath: string): string[] | undefined {
		const declaredModules = this.declaredModulesByEntrypoint.get(entrypointPath);
		return declaredModules ? [...declaredModules] : undefined;
	}
}
