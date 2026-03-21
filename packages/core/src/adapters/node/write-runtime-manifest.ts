import { writeAppNodeRuntimeManifest, type NodeRuntimeManifest } from '../../services/node-runtime-manifest.service.ts';

/**
 * Writes the app-owned Node runtime manifest from a bundled manifest-writer
 * entrypoint.
 *
 * @remarks
 * The Node thin-host launch plan executes a bundled JavaScript prep artifact
 * instead of evaluating TypeScript config directly in the launcher. This helper
 * is the narrow bridge between that bundle and the core-owned manifest writer.
 */
export function writeBundledNodeRuntimeManifest(
	appConfig: {
		rootDir: string;
		absolutePaths: {
			config: string;
			srcDir: string;
			distDir: string;
		};
		loaders: Map<string, unknown>;
		runtime?: {
			nodeRuntimeManifest?: NodeRuntimeManifest;
		};
	},
	options: {
		entryModulePath: string;
		manifestFilePath: string;
	},
): void {
	if (!appConfig || typeof appConfig !== 'object') {
		throw new Error('Invalid Ecopages app config export for bundled runtime manifest generation.');
	}

	writeAppNodeRuntimeManifest(appConfig as never, {
		entryModulePath: options.entryModulePath,
		manifestFilePath: options.manifestFilePath,
	});
}
