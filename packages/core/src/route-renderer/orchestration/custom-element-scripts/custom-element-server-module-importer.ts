import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import path from 'node:path';

/**
 * Imports one registered script through the app server module loader for SSR.
 *
 * @remarks
 * Uses an isolated outdir per custom-element registry so concurrent renders do
 * not share mutable module evaluation state.
 */
export function createCustomElementServerModuleImporter(appConfig: EcoPagesAppConfig, outdirSegment: string) {
	return async (filePath: string, registryKey: string): Promise<unknown> => {
		const loader = appConfig.runtime?.appModuleLoader;
		if (!loader) {
			throw new Error('Custom element SSR script preload requires the app server module loader');
		}

		return loader.importModule({
			filePath,
			rootDir: appConfig.rootDir,
			outdir: path.join(appConfig.absolutePaths.workDir, outdirSegment, registryKey),
			forceBuild: true,
		});
	};
}
