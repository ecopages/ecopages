import { createRendererModuleContext } from './integration-di.ts';
import type { Alias, AliasOptions, SSROptions } from 'vite';
import type { EcopagesPluginApi } from './plugin-api.ts';
import type { EcopagesVitePlugin, EcopagesViteUserConfig } from './types.ts';

function mergeStringLists(left: string[] | undefined, right: string[]): string[] | undefined {
	const values = [...(left ?? []), ...right];

	if (!values.length) {
		return left;
	}

	return Array.from(new Set(values));
}

function toAliasEntries(aliases: Record<string, string>): Alias[] {
	return Object.entries(aliases).map(([find, replacement]) => ({ find, replacement }));
}

function mergeAliases(existing: AliasOptions | undefined, aliases: Record<string, string>): AliasOptions | undefined {
	const additions = toAliasEntries(aliases);

	if (additions.length === 0) {
		return existing;
	}

	if (Array.isArray(existing)) {
		return [...additions, ...existing];
	}

	return {
		...(existing ?? {}),
		...aliases,
	};
}

function mergeNoExternal(existing: SSROptions['noExternal'], additions: string[]): SSROptions['noExternal'] {
	if (existing === true) {
		return true;
	}

	if (!existing) {
		return additions.length > 0 ? additions : existing;
	}

	if (Array.isArray(existing)) {
		const merged = [...existing];
		const seenStrings = new Set(existing.filter((entry): entry is string => typeof entry === 'string'));

		for (const addition of additions) {
			if (seenStrings.has(addition)) {
				continue;
			}

			seenStrings.add(addition);
			merged.push(addition);
		}

		return merged;
	}

	if (typeof existing === 'string') {
		return Array.from(new Set([existing, ...additions]));
	}

	return [existing, ...additions];
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
					alias: mergeAliases(config.resolve?.alias, api.options.aliases),
				},
				optimizeDeps: {
					include: mergeStringLists(config.optimizeDeps?.include, api.options.optimizeDeps.include),
				},
				ssr: {
					noExternal: mergeNoExternal(config.ssr?.noExternal, api.options.ssr.noExternal),
				},
			};
		},
	};
}
