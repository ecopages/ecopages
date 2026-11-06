import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { fileURLToPath } from 'node:url';
import type { BuildOptions, BuildSuccess } from './build-adapter.ts';

function tryRealpath(filePath: string): string | undefined {
	try {
		return fileSystem.exists(filePath) ? fileSystem.realpath(filePath) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Absolute path for an entry as the caller passed it, without resolving symlinks.
 */
export function resolveBuildEntryPath(entry: string, root: string): string {
	return path.resolve(root, entry);
}

function requestedBuildEntries(
	entrypoints: BuildOptions['entrypoints'],
	root: string,
): Array<{ name: string; entry: string; resolved: string }> {
	const pairs = Array.isArray(entrypoints)
		? entrypoints.map((entry) => [entry, entry] as const)
		: Object.entries(entrypoints);
	return pairs.map(([name, entry]) => ({
		name,
		entry,
		resolved: resolveBuildEntryPath(entry, root),
	}));
}

function isSameBuildEntry(left: string, right: string): boolean {
	if (left === right) {
		return true;
	}
	const leftReal = tryRealpath(left);
	const rightReal = tryRealpath(right);
	return Boolean(leftReal && rightReal && leftReal === rightReal);
}

/**
 * Records every spelling a caller may use to look up one entry's output.
 *
 * @remarks
 * Rolldown keys facades by the on-disk real path. Callers keep the path they
 * passed, which differs across a symlink or, on Windows, across drive casing.
 * Named grouped entries also look up by the record key they chose.
 */
export function recordBuildEntryOutput(
	entryOutputs: Record<string, string>,
	outputPath: string,
	options: {
		facadeModuleId: string;
		chunkName?: string;
		entrypoints: BuildOptions['entrypoints'];
		root: string;
	},
): void {
	const keys = new Set<string>([options.facadeModuleId]);
	const facadeReal = tryRealpath(options.facadeModuleId);
	if (facadeReal) {
		keys.add(facadeReal);
	}
	for (const requested of requestedBuildEntries(options.entrypoints, options.root)) {
		const matchesFacade =
			isSameBuildEntry(options.facadeModuleId, requested.resolved) ||
			isSameBuildEntry(options.facadeModuleId, requested.entry);
		const matchesName = options.chunkName !== undefined && options.chunkName === requested.name;
		if (!matchesFacade && !matchesName) {
			continue;
		}
		keys.add(requested.entry);
		keys.add(requested.resolved);
		keys.add(requested.name);
		const requestedReal = tryRealpath(requested.resolved);
		if (requestedReal) {
			keys.add(requestedReal);
		}
	}
	for (const key of keys) {
		entryOutputs[key] = outputPath;
	}
}

/**
 * Finds the emitted file for an entry using the path or name the caller passed.
 */
export function getBuildEntryOutput(
	result: Pick<BuildSuccess, 'entryOutputs'>,
	entry: string,
	root: string,
): string | undefined {
	const outputs = result.entryOutputs;
	const resolved = resolveBuildEntryPath(entry, root);
	for (const key of [entry, resolved, tryRealpath(entry), tryRealpath(resolved)]) {
		if (key && outputs[key]) {
			return outputs[key];
		}
	}
	const wantReal = tryRealpath(resolved) ?? tryRealpath(entry);
	if (!wantReal) {
		return undefined;
	}
	for (const [key, output] of Object.entries(outputs)) {
		if (tryRealpath(key) === wantReal) {
			return output;
		}
	}
	return undefined;
}

/**
 * Collects the files one entry's output depends on: its source-module closure and the files its plugins declared.
 */
export function collectBuildEntryInputPaths(
	result: Pick<BuildSuccess, 'dependencyGraph'>,
	entry: string,
	root: string,
	options: { includeNodeModules?: boolean } = {},
): string[] {
	const resolvedEntry = resolveBuildEntryPath(entry, root);
	const entrypoints = result.dependencyGraph.entrypoints;
	const closureEntry = [resolvedEntry, tryRealpath(resolvedEntry)].find(
		(candidate) => candidate && entrypoints[candidate],
	);
	const moduleClosure = closureEntry ? entrypoints[closureEntry] : undefined;
	return [...new Set(moduleClosure?.length ? moduleClosure : [resolvedEntry])].filter(
		(filePath) =>
			path.isAbsolute(filePath) &&
			(options.includeNodeModules === true || !filePath.includes(`${path.sep}node_modules${path.sep}`)) &&
			!filePath.includes('\0'),
	);
}

/**
 * @remarks
 * Traverses emitted chunk edges without reading output code. Local external
 * imports remain in the result even when missing, so in-process caches fail
 * validation when a generated server module has been removed.
 */
export function collectBuildOutputImports(result: Pick<BuildSuccess, 'outputGraph'>, outputPath: string): string[] {
	const visited = new Set([outputPath]);
	for (const current of visited) {
		const chunk = result.outputGraph[current];
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
