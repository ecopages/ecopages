import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import path from 'node:path';
import { requireAppRuntime } from '../../../config/app-runtime.ts';
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
		return requireAppRuntime(appConfig).moduleLoader.importModule({
			filePath,
			rootDir: appConfig.rootDir,
			outdir: path.join(appConfig.absolutePaths.workDir, outdirSegment, registryKey),
		});
	};
}

/**
 * Imports an `ssr: true` script through the same server-module graph as pages.
 *
 * @remarks A separate outdir per registry compiles a second copy of
 * Radiant and breaks host SSR. This outdir matches page imports and keeps
 * package specifiers external.
 */
export function createSharedServerModuleImporter(appConfig: EcoPagesAppConfig) {
	return async (filePath: string): Promise<unknown> => {
		return requireAppRuntime(appConfig).moduleLoader.importModule({
			filePath,
			rootDir: appConfig.rootDir,
			outdir: `${resolveInternalExecutionDir(appConfig)}/.server-modules`,
			externalPackages: true,
		});
	};
}
