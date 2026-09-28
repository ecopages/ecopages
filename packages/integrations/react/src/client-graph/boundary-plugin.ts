/**
 * @module ClientGraphBoundaryPlugin
 *
 * Build plugin securing the Ecopages isomorphic compilation pipeline.
 */

import { readFileSync } from 'node:fs';
import type { EcoBuildPlugin } from '@ecopages/core/plugins/integration-plugin';
import { ClientGraphBoundaryCache, type RequestedExportRules } from './boundary-cache.ts';
import {
	parseDeclaredModules,
	toModuleBaseSpecifier,
	normalizeRequestedExportsKey,
} from './specifier-classification.ts';
import { classifyClientGraphModule } from './module-classification.ts';
import { recordModuleTransformProfile } from '@ecopages/core/cache';
import { replayCachedClientGraphTransform, transformClientGraphModule } from './boundary-plugin-transform.ts';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;

/**
 * Configuration options for the Client Graph Boundary build plugin.
 */
type ClientGraphBoundaryOptions = {
	projectRoot?: string;
	absWorkingDir?: string;
	declaredModules?: readonly string[];
	alwaysAllowSpecifiers?: string[];
	cache?: ClientGraphBoundaryCache;
};

/**
 * Instantiates the client graph boundary build plugin.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	return {
		name: 'ecopages-client-graph-boundary',
		setup(build) {
			const absWorkingDir = options?.absWorkingDir ?? process.cwd();
			const cache = options?.cache;
			const globallyDeclaredSources = parseDeclaredModules(options?.declaredModules);
			const requestedExports = new Map<string, RequestedExportRules>();
			for (const alwaysAllow of options?.alwaysAllowSpecifiers ?? []) {
				globallyDeclaredSources.set(toModuleBaseSpecifier(alwaysAllow), '*');
			}

			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) => {
				const category = classifyClientGraphModule(args.path, options?.projectRoot);
				if (category === 'package' || category === 'vendored' || category === 'virtual') {
					return undefined;
				}

				let source: string;
				try {
					source = readFileSync(args.path, 'utf-8');
				} catch {
					return undefined;
				}

				const inboundRules = requestedExports.get(normalizeRequestedExportsKey(args.path));
				const transformOptions = {
					filePath: args.path,
					source,
					absWorkingDir,
					category,
					globallyDeclaredSources,
					requestedExports,
					cache,
					inboundRules,
				};

				if (cache) {
					const cacheStartedAt = performance.now();
					const cached = cache.get(args.path, source, globallyDeclaredSources, inboundRules);
					recordModuleTransformProfile({
						category,
						phase: 'cache-lookup',
						ms: performance.now() - cacheStartedAt,
						cacheHit: Boolean(cached),
					});
					if (cached) {
						return replayCachedClientGraphTransform(transformOptions, cached);
					}
				}

				return transformClientGraphModule(transformOptions);
			});
		},
	};
}
