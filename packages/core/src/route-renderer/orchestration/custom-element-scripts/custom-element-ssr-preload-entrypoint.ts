import {
	AssetFactory,
	type AssetDefinition,
	type ProcessedAsset,
} from '../../../services/assets/asset-processing-service/index.ts';

export type CustomElementSsrPreloadEntrypointResolverOptions = {
	preferSourceImports: boolean;
	processDependencies?: (dependencies: AssetDefinition[], integrationName: string) => Promise<ProcessedAsset[]>;
};

/**
 * Resolves SSR script paths through the asset pipeline so preload imports share
 * the renderer dependency graph instead of an isolated app-module bundle.
 */
export function createCustomElementSsrPreloadEntrypointResolver({
	preferSourceImports,
	processDependencies,
}: CustomElementSsrPreloadEntrypointResolverOptions): (scriptPath: string) => Promise<string> {
	const entrypointCache = new Map<string, string>();

	return async (scriptPath: string): Promise<string> => {
		const cachedEntrypoint = entrypointCache.get(scriptPath);
		if (cachedEntrypoint) {
			return cachedEntrypoint;
		}

		if (preferSourceImports) {
			entrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}

		if (!processDependencies) {
			entrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}

		try {
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

			const entrypoint = processed[0]?.filepath ?? scriptPath;
			entrypointCache.set(scriptPath, entrypoint);
			return entrypoint;
		} catch (error) {
			if (process.env.ECOPAGES_DEBUG === 'true') {
				console.warn(
					`[ecopages] Failed to resolve custom-element SSR preload entrypoint for: ${scriptPath}`,
					error,
				);
			}
			entrypointCache.set(scriptPath, scriptPath);
			return scriptPath;
		}
	};
}
