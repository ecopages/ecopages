import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileSystem } from '@ecopages/file-system';
import {
	AssetFactory,
	type AssetDefinition,
	type ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';

export type CustomElementSsrPipelineImporterOptions = {
	processDependencies: (dependencies: AssetDefinition[], integrationName: string) => Promise<ProcessedAsset[]>;
};

/**
 * Imports SSR scripts from their asset-pipeline output so preload shares the
 * renderer dependency graph instead of an isolated app-module bundle.
 *
 * @remarks
 * A script the pipeline cannot build is reported as a preload failure; it is
 * never imported from source, because a native source import skips the server
 * loaders for CSS, MDX and assets.
 */
export function createCustomElementSsrPipelineImporter({
	processDependencies,
}: CustomElementSsrPipelineImporterOptions): (scriptPath: string, registryKey: string) => Promise<void> {
	const entrypointCache = new Map<string, string>();

	const resolveEntrypoint = async (scriptPath: string): Promise<string> => {
		const processed = await processDependencies(
			[
				AssetFactory.createInlineFileScript({
					filepath: scriptPath,
					excludeFromHtml: true,
					position: 'head',
					bundle: true,
					attributes: {
						type: 'module',
						defer: '',
					},
				}),
			],
			`custom-element-ssr-preload:${scriptPath}`,
		);

		const entrypoint = processed[0]?.filepath;
		if (!entrypoint || path.resolve(entrypoint) === path.resolve(scriptPath)) {
			throw new Error(`The asset pipeline produced no server module for SSR script ${scriptPath}`);
		}
		return entrypoint;
	};

	return async (scriptPath, registryKey) => {
		let entrypoint = entrypointCache.get(scriptPath);
		if (!entrypoint) {
			entrypoint = await resolveEntrypoint(scriptPath);
			entrypointCache.set(scriptPath, entrypoint);
		}
		await importModuleForRegistry(entrypoint, registryKey);
	};
}

/**
 * Evaluates an asset-pipeline module against one custom-element registry.
 *
 * @remarks
 * Bun ignores a query-only URL change for every module, so a query cannot
 * evaluate the module again for a new registry. A copy beside the pipeline
 * file has its own path, so both runtimes evaluate it again, and it keeps the
 * original's package scope and relative `import()`/`import.meta.url`
 * resolution. The copy is removed once evaluated, so it never reaches the
 * build output.
 */
async function importModuleForRegistry(modulePath: string, registryKey: string): Promise<void> {
	const { dir, name, ext } = path.parse(modulePath);
	const copyPath = path.join(dir, `${name}.eco-ssr-${registryKey}${ext}`);
	await fileSystem.copyFileAsync(modulePath, copyPath);
	try {
		await import(/* @vite-ignore */ pathToFileURL(copyPath).href);
	} finally {
		await fileSystem.removeAsync(copyPath);
	}
}
