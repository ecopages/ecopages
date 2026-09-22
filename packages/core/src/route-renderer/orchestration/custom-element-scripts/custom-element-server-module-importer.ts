import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import path from 'node:path';
import { getAppModuleLoader } from '../../../services/module-loading/app-server-module-transpiler.service.ts';
import { resolveInternalExecutionDir } from '../../../utils/resolve-work-dir.ts';

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

/**
 * Imports an `ssr: true` script through the same server-module graph as pages.
 *
 * @remarks A per-registry outdir with `forceBuild` compiles a second copy of
 * Radiant and breaks host SSR. This outdir matches page imports and keeps
 * package specifiers external.
 */
export function createSharedServerModuleImporter(appConfig: EcoPagesAppConfig) {
	return async (filePath: string): Promise<unknown> => {
		return getAppModuleLoader(appConfig).importModule({
			filePath,
			rootDir: appConfig.rootDir,
			outdir: `${resolveInternalExecutionDir(appConfig)}/.server-modules`,
			externalPackages: true,
		});
	};
}
