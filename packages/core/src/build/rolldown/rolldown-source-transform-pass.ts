import path from 'node:path';
import type { LoadResult, SourceDescription } from 'rolldown';
import { fileSystem } from '@ecopages/file-system';
import {
	applySourceTransforms,
	normalizeTransformId,
	type EcoSourceTransform,
} from '../../plugins/source-transform.ts';

/**
 * Standard source extensions eligible for the browser post-load transform pass.
 *
 * @remarks
 * Compound integration templates (for example `.kita.tsx`) still match because
 * matching uses the final path suffix. Keep this aligned with integration
 * template extensions registered in app config.
 */
const TRANSFORMABLE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mdx']);

function shouldApplySourceTransforms(namespace: string | undefined, sourcePath: string): boolean {
	if (namespace !== undefined) {
		return false;
	}

	const normalizedPath = normalizeTransformId(sourcePath);
	return TRANSFORMABLE_SOURCE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase());
}

function shouldTransformLoadedModule(moduleType: string | undefined): boolean {
	return moduleType !== 'css' && moduleType !== 'asset';
}

function applyTransformsToLoadedSource(
	sourceTransforms: readonly EcoSourceTransform[],
	id: string,
	sourcePath: string,
	code: string,
): string {
	if (sourceTransforms.length === 0) {
		return code;
	}

	return applySourceTransforms(sourceTransforms, code, sourcePath);
}

/**
 * Runs app-owned source transforms after first-wins `onLoad` plugins produce
 * module contents for one Rolldown load request.
 */
export async function finalizeLoadResultWithSourceTransforms(options: {
	id: string;
	namespace: string | undefined;
	sourcePath: string;
	loadResult: LoadResult | undefined;
	sourceTransforms: readonly EcoSourceTransform[];
	contextRoot: string;
	inferModuleTypeFromPath: (filePath: string) => SourceDescription['moduleType'];
}): Promise<LoadResult | undefined> {
	const { id, namespace, sourcePath, loadResult, sourceTransforms, contextRoot, inferModuleTypeFromPath } = options;

	if (!shouldApplySourceTransforms(namespace, sourcePath)) {
		return loadResult;
	}

	if (
		typeof loadResult === 'object' &&
		loadResult !== null &&
		'code' in loadResult &&
		typeof loadResult.code === 'string'
	) {
		if (!shouldTransformLoadedModule(loadResult.moduleType)) {
			return loadResult;
		}

		const transformedCode = applyTransformsToLoadedSource(sourceTransforms, id, sourcePath, loadResult.code);
		if (transformedCode === loadResult.code) {
			return loadResult;
		}

		return {
			code: transformedCode,
			moduleType: loadResult.moduleType,
		};
	}

	if (loadResult !== undefined || sourceTransforms.length === 0) {
		return loadResult;
	}

	const normalizedPath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(contextRoot, sourcePath);
	if (!fileSystem.exists(normalizedPath)) {
		return loadResult;
	}

	const originalCode = fileSystem.readFileSync(normalizedPath);
	const transformedCode = applyTransformsToLoadedSource(sourceTransforms, id, sourcePath, originalCode);
	if (transformedCode === originalCode) {
		return loadResult;
	}

	return {
		code: transformedCode,
		moduleType: inferModuleTypeFromPath(normalizedPath),
	};
}
