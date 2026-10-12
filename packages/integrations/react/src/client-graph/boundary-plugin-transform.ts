import { dirname, extname } from 'node:path';
import type { EcoBuildOnLoadResult } from '@ecopages/core/plugins/integration-plugin';
import { recordModuleTransformProfile } from '@ecopages/core/cache';
import { inlineReadFileSyncCalls } from './boundary-plugin-read-file-inline.ts';
import { transformModuleImports } from './ast-transform.ts';
import { isPageOrLayoutEntry } from './module-classification.ts';
import type { ClientGraphModuleKind } from './module-classification.ts';
import type { RequestedExportRules } from './specifier-classification.ts';

export type TransformClientGraphModuleOptions = {
	filePath: string;
	source: string;
	absWorkingDir: string;
	category: ClientGraphModuleKind;
	globallyDeclaredSources: Map<string, Set<string> | '*'>;
	requestedExports: Map<string, RequestedExportRules>;
};

function toLoaderResult(filePath: string, contents: string): EcoBuildOnLoadResult {
	const ext = extname(filePath).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
	return { contents, loader: ext, resolveDir: dirname(filePath) };
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

	if (!modified) return undefined;
	return toLoaderResult(options.filePath, transformed);
}
