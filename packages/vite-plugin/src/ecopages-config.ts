import { createRendererModuleContext } from './integration-di.ts';
import type { SSROptions } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin, EcopagesViteUserConfig } from './types.ts';

function mergeStringLists(left: string[] | undefined, right: string[]): string[] | undefined {
	const values = [...(left ?? []), ...right];

	if (!values.length) {
		return left;
	}

	return Array.from(new Set(values));
}

function normalizeNoExternal(value: SSROptions['noExternal']): string[] | undefined {
	if (!value) {
		return undefined;
	}

	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === 'string');
	}

	return typeof value === 'string' ? [value] : undefined;
}

/**
 * Applies Ecopages-owned defaults to the host Vite config and renderer module context.
 */
export function ecopagesConfig(api: EcopagesPluginApi): EcopagesVitePlugin {
	return {
		name: 'ecopages:config',
		configResolved() {
			api.appConfig.runtime = {
				...(api.appConfig.runtime ?? {}),
				rendererModuleContext: createRendererModuleContext(api.appConfig),
			};

			if (!api.options.diagnostics.logResolvedPluginNames) {
				return;
			}

			console.info(`[ecopages] plugins: ${api.getResolvedPluginNames().join(', ')}`);
		},
		config(config): EcopagesViteUserConfig {
			return {
				resolve: {
					alias: {
						...(config.resolve?.alias ?? {}),
						...api.options.aliases,
					},
				},
				optimizeDeps: {
					include: mergeStringLists(config.optimizeDeps?.include, api.options.optimizeDeps.include),
				},
				ssr: {
					noExternal: mergeStringLists(
						normalizeNoExternal(config.ssr?.noExternal),
						api.options.ssr.noExternal,
					),
				},
			};
		},
	};
}
