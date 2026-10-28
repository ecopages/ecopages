import { getServerModuleBuildCacheOutdir } from './route-module-build-cache-registry.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import type { EcoPageComponent, ViewLoader } from '../../types/contracts.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';

/**
 * Loads a view through the app module loader.
 *
 * @remarks
 * Development compiles from source with watcher invalidation. Production imports
 * the module `ecopages build` wrote to the server-modules map.
 */
export async function importViewModule<T = unknown>(appConfig: EcoPagesAppConfig, filePath: string): Promise<T> {
	return await requireAppRuntime(appConfig).moduleLoader.importModule<T>({
		filePath,
		outdir: getServerModuleBuildCacheOutdir(appConfig),
		externalPackages: true,
	});
}

export function createViewLoaderFromFilePath<P = Record<string, unknown>>(
	appConfig: EcoPagesAppConfig,
	filePath: string,
): ViewLoader<P> {
	const loader: ViewLoader<P> = async () =>
		await importViewModule<{ default: EcoPageComponent<P> }>(appConfig, filePath);
	loader.filePath = filePath;
	return loader;
}
