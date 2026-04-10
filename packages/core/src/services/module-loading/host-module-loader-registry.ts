import type { SourceModuleLoader } from './module-loading-types.ts';

let hostModuleLoader: SourceModuleLoader | undefined;

export function setHostModuleLoader(loader: SourceModuleLoader): void {
	hostModuleLoader = loader;
}

export function getHostModuleLoader(): SourceModuleLoader | undefined {
	return hostModuleLoader;
}

export function clearHostModuleLoader(): void {
	hostModuleLoader = undefined;
}
