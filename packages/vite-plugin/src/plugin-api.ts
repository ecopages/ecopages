import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from '@ecopages/core';
import type { EcopagesVitePlugin, EcopagesVitePluginOption } from './types.ts';

/**
 * Public options accepted by the composed Ecopages Vite entrypoint.
 *
 * @remarks
 * `appConfig` remains the source of truth for Ecopages semantics. The remaining
 * fields are Vite-facing overrides that get resolved once and then forwarded to
 * the internal plugin buckets through the shared plugin API.
 */
/**
 * Configuration provided by a host adapter (e.g. Nitro) to compose
 * host-specific Vite plugins into the Ecopages plugin surface.
 */
export interface EcopagesHostConfig {
	plugins: (api: EcopagesPluginApi) => EcopagesVitePluginOption[];
}

export interface EcopagesViteOptions {
	appConfig: EcoPagesAppConfig;
	aliases?: Record<string, string>;
	optimizeDeps?: {
		include?: string[];
	};
	ssr?: {
		noExternal?: string[];
	};
	diagnostics?: {
		logResolvedPluginNames?: boolean;
	};
	host?: EcopagesHostConfig;
}

/**
 * Normalized Ecopages Vite options consumed by the composed plugin buckets.
 */
export interface ResolvedEcopagesViteOptions {
	appConfig: EcoPagesAppConfig;
	aliases: Record<string, string>;
	optimizeDeps: {
		include: string[];
	};
	ssr: {
		noExternal: string[];
	};
	diagnostics: {
		logResolvedPluginNames: boolean;
	};
	host?: EcopagesHostConfig;
}

/**
 * Shared state forwarded across the composed Ecopages Vite plugin buckets.
 *
 * @remarks
 * This surface intentionally stays small: it exposes the resolved app config,
 * normalized plugin options, and the helpers that multiple plugin buckets need
 * in common.
 */
export interface EcopagesPluginApi {
	appConfig: EcoPagesAppConfig;
	options: ResolvedEcopagesViteOptions;
	getSourceTransforms(): EcoSourceTransform[];
	setResolvedPluginNames(pluginNames: string[]): void;
	getResolvedPluginNames(): string[];
}

function uniqueStringList(values: string[] | undefined): string[] {
	if (!values?.length) {
		return [];
	}

	return Array.from(new Set(values));
}

/**
 * Flattens nested Vite plugin options into a concrete plugin list.
 */
export function flattenPluginOptions(pluginOptions: EcopagesVitePluginOption[] | undefined): EcopagesVitePlugin[] {
	if (!pluginOptions?.length) {
		return [];
	}

	const flattened: EcopagesVitePlugin[] = [];

	for (const pluginOption of pluginOptions) {
		if (!pluginOption) {
			continue;
		}

		if (Array.isArray(pluginOption)) {
			flattened.push(...flattenPluginOptions(pluginOption));
			continue;
		}

		flattened.push(pluginOption);
	}

	return flattened;
}

/**
 * Wraps a bundler-neutral source transform into a Vite plugin with proper
 * name and source-map casting.
 */
export function adaptSourceTransformToVitePlugin(
	plugin: EcoViteCompatiblePlugin,
	nameOverride?: string,
): EcopagesVitePlugin {
	return {
		name: nameOverride ?? plugin.name,
		enforce: plugin.enforce,
		transform(code, id) {
			const result = plugin.transform(code, id);

			if (!result || typeof result === 'string') {
				return result;
			}

			return {
				code: result.code,
				map: result.map as never,
			};
		},
	};
}

/**
 * Creates the shared plugin API used by the composed Ecopages Vite surface.
 */
export function createEcopagesPluginApi(options: EcopagesViteOptions): EcopagesPluginApi {
	const resolvedOptions: ResolvedEcopagesViteOptions = {
		appConfig: options.appConfig,
		aliases: options.aliases ?? {},
		optimizeDeps: {
			include: uniqueStringList(options.optimizeDeps?.include),
		},
		ssr: {
			noExternal: uniqueStringList(options.ssr?.noExternal),
		},
		diagnostics: {
			logResolvedPluginNames: options.diagnostics?.logResolvedPluginNames ?? false,
		},
		host: options.host,
	};

	let resolvedPluginNames: string[] = [];

	return {
		appConfig: options.appConfig,
		options: resolvedOptions,
		getSourceTransforms() {
			return Array.from(options.appConfig.sourceTransforms.values());
		},
		setResolvedPluginNames(pluginNames) {
			resolvedPluginNames = [...pluginNames];
		},
		getResolvedPluginNames() {
			return [...resolvedPluginNames];
		},
	};
}
