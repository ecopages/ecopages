import {
	writeAppNodeRuntimeManifest,
	type NodeRuntimeManifest,
} from '../../services/node-runtime-manifest.service.ts';

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