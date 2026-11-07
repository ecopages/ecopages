import { path } from '@ecopages/file-system/path';
import type { EcoBuildOnLoadResult } from '@ecopages/core/integration';
import { recordModuleTransformProfile } from '@ecopages/core/build';
import { transformModuleImports } from './ast-transform.ts';
import { isPageOrLayoutEntry } from './module-classification.ts';
import type { ClientGraphModuleKind } from './module-classification.ts';
import type { RequestedExportRules } from './specifier-classification.ts';
import type { PlannedModule } from './requested-exports-plan.ts';

export type TransformClientGraphModuleOptions = {
	filePath: string;
	/** The module after read-file inlining, with its parse when the caller has one. */
	module: PlannedModule;
	category: ClientGraphModuleKind;
	globallyDeclaredSources: Map<string, Set<string> | '*'>;
	requestedExports: RequestedExportRules | undefined;
	preserveUnreachableSideEffectImports?: boolean;
};

function toLoaderResult(filePath: string, contents: string): EcoBuildOnLoadResult {
	const ext = path.extname(filePath).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
	return { contents, loader: ext };
}

/**
 * Applies import transforms to one client-graph module whose read-file calls are already inlined.
 */
export function transformClientGraphModule(
	options: TransformClientGraphModuleOptions,
): EcoBuildOnLoadResult | undefined {
	const { module } = options;
	const analysisStartedAt = performance.now();
	const { transformed, modified } = transformModuleImports(
		module.source,
		options.filePath,
		options.globallyDeclaredSources,
		options.requestedExports,
		Boolean(options.preserveUnreachableSideEffectImports) && !isPageOrLayoutEntry(options.filePath),
		module.program,
	);
	recordModuleTransformProfile({
		category: options.category,
		phase: 'analysis',
		ms: performance.now() - analysisStartedAt,
	});

	if (!modified && !module.inlined) return undefined;
	return toLoaderResult(options.filePath, transformed);
}
