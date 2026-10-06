import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BuildResult } from './build-adapter.ts';

export function resolveBuildEntryPath(entry: string, root: string): string {
	return path.resolve(root, entry);
}

export function getBuildEntryOutput(
	result: Pick<BuildResult, 'entryOutputs'>,
	entry: string,
	root: string,
): string | undefined {
	return result.entryOutputs?.[resolveBuildEntryPath(entry, root)];
}

/**
 * @remarks
 * Traverses emitted chunk edges without reading output code. Local external
 * imports remain in the result even when missing, so persisted caches fail
 * validation when a generated server module has been removed.
 */
export function collectBuildOutputImports(result: Pick<BuildResult, 'outputGraph'>, outputPath: string): string[] {
	const visited = new Set([outputPath]);
	for (const current of visited) {
		const chunk = result.outputGraph?.[current];
		if (!chunk) continue;
		for (const imported of [...chunk.imports, ...chunk.dynamicImports]) {
			const local = imported.startsWith('file:')
				? fileURLToPath(imported)
				: path.isAbsolute(imported)
					? imported
					: imported.startsWith('.')
						? path.resolve(path.dirname(current), imported)
						: undefined;
			if (local) visited.add(local);
		}
	}
	visited.delete(outputPath);
	return [...visited];
}
