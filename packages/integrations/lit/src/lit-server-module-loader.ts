import type { EcoPagesAppConfig } from '@ecopages/core';
import path from 'node:path';

/**
 * Uses server export conditions and isolates module evaluation by custom-element
 * registry. Browser asset output must never be evaluated as the SSR implementation.
 */
export function createLitServerModuleImporter(appConfig: EcoPagesAppConfig) {
	return async (filePath: string, registryKey: string): Promise<unknown> => {
		const loader = appConfig.runtime?.appModuleLoader;
		if (!loader) throw new Error('Lit SSR requires the app server module loader');
		return loader.importModule({
			filePath,
			rootDir: appConfig.rootDir,
			outdir: path.join(appConfig.absolutePaths.workDir, '.lit-ssr', registryKey),
			forceBuild: true,
		});
	};
}
