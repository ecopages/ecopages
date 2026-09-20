import { dirname, extname } from 'node:path';
import type { EcoBuildOnLoadResult } from '@ecopages/core/plugins/integration-plugin';
import { recordModuleTransformProfile } from '@ecopages/core/cache';
import { inlineReadFileSyncCalls } from './boundary-plugin-read-file-inline.ts';
import { transformModuleImports } from './ast-transform.ts';
import type { CachedTransform, ClientGraphBoundaryCache, RequestedExportRules } from './boundary-cache.ts';
import { isPageOrLayoutEntry } from './module-classification.ts';
import type { ClientGraphModuleKind } from './module-classification.ts';
import { diffRequestedExportRules, mergeRequestedExportRules, snapshotRegistry } from './specifier-classification.ts';

export type TransformClientGraphModuleOptions = {
	filePath: string;
	source: string;
	absWorkingDir: string;
	category: ClientGraphModuleKind;
	globallyDeclaredSources: Map<string, Set<string> | '*'>;
	requestedExports: Map<string, RequestedExportRules>;
	cache?: ClientGraphBoundaryCache;
	inboundRules?: RequestedExportRules;
};

function toLoaderResult(filePath: string, contents: string): EcoBuildOnLoadResult {
	const ext = extname(filePath).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
	return { contents, loader: ext, resolveDir: dirname(filePath) };
}

function persistTransformCache(
	options: TransformClientGraphModuleOptions,
	source: string,
	transformed: string,
	modified: boolean,
	registryBefore: Map<string, RequestedExportRules | undefined>,
	inlinedExternalFile: boolean,
): void {
	const cache = options.cache;
	if (!cache || inlinedExternalFile) return;

	const rulesAdded = new Map<string, RequestedExportRules>();
	for (const [key, afterRules] of options.requestedExports) {
		const beforeRules = registryBefore.get(key);
		const diff = diffRequestedExportRules(beforeRules, afterRules);
		if (!diff) continue;
		rulesAdded.set(key, diff);
	}
	const entry: Omit<CachedTransform, 'sourceHash' | 'allowListHash' | 'inboundRulesHash'> = {
		transformed,
		modified,
		rulesAdded,
	};
	cache.set(options.filePath, source, options.globallyDeclaredSources, entry, options.inboundRules);
}

/**
 * Applies read-file inlining and import transforms for one client-graph module.
 */
export function transformClientGraphModule(
	options: TransformClientGraphModuleOptions,
): EcoBuildOnLoadResult | undefined {
	const readFileInlining = inlineReadFileSyncCalls(options.source, options.filePath, options.absWorkingDir);
	let transformed = readFileInlining.transformed;
	let modified = readFileInlining.modified;

	const registryBefore = snapshotRegistry(options.requestedExports);
	const analysisStartedAt = performance.now();
	const { transformed: oxcTransformed, modified: importsModified } = transformModuleImports(
		transformed,
		options.filePath,
		options.globallyDeclaredSources,
		options.requestedExports,
		isPageOrLayoutEntry(options.filePath),
	);
	recordModuleTransformProfile({
		category: options.category,
		phase: 'analysis',
		ms: performance.now() - analysisStartedAt,
	});

	if (importsModified) {
		modified = true;
		transformed = oxcTransformed;
	}

	persistTransformCache(
		options,
		options.source,
		transformed,
		modified,
		registryBefore,
		readFileInlining.inlinedExternalFile,
	);

	if (!modified) return undefined;
	return toLoaderResult(options.filePath, transformed);
}

export function replayCachedClientGraphTransform(
	options: TransformClientGraphModuleOptions,
	cached: CachedTransform,
): EcoBuildOnLoadResult | undefined {
	for (const [moduleKey, rules] of cached.rulesAdded) {
		mergeRequestedExportRules(options.requestedExports, moduleKey, rules);
	}
	if (!cached.modified) return undefined;
	return toLoaderResult(options.filePath, cached.transformed);
}
