import type { EcoPagesAppConfig } from '@ecopages/core/internal-types';
import type { EcoSourceTransform, EcoViteCompatiblePlugin } from '@ecopages/core';
import type { EcopagesVitePlugin } from './types.ts';

/**
 * Public options accepted by the composed Ecopages Vite entrypoint.
 *
 * @remarks
 * `appConfig` remains the source of truth for Ecopages semantics. The remaining
 * fields are Vite-facing overrides that get resolved once and then forwarded to
 * the internal plugin buckets through the shared plugin API.
 */
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
