import path from 'node:path';

export type ClientGraphModuleKind = 'app' | 'workspace' | 'package' | 'vendored' | 'virtual';

/**
 * Splits a file path into OS-agnostic segments.
 *
 * @remarks
 * Bundlers may pass POSIX or Windows separators; classification must not depend
 * on the host's `path.sep` alone.
 */
function pathSegments(filePath: string): string[] {
	return filePath.split(/[\\/]+/).filter(Boolean);
}

function hasPathSegment(filePath: string, segment: string): boolean {
	return pathSegments(filePath).includes(segment);
}

function hasPathSuffix(filePath: string, segments: readonly string[]): boolean {
	const parts = pathSegments(filePath);
	for (let index = 0; index <= parts.length - segments.length; index += 1) {
		if (segments.every((segment, offset) => parts[index + offset] === segment)) {
			return true;
		}
	}
	return false;
}

export function classifyClientGraphModule(filePath: string, projectRoot?: string): ClientGraphModuleKind {
	if (filePath.startsWith('\0') || filePath.includes('?')) return 'virtual';
	if (hasPathSegment(filePath, 'node_modules')) return 'package';
	if (hasPathSegment(filePath, '.eco') || hasPathSuffix(filePath, ['assets', 'vendors'])) return 'vendored';
	if (projectRoot) {
		const resolvedRoot = path.resolve(projectRoot);
		const resolvedFile = path.resolve(filePath);
		if (resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
			return 'app';
		}
	}
	return 'workspace';
}

export function isPageOrLayoutEntry(filePath: string): boolean {
	const segments = pathSegments(filePath);
	return segments.includes('pages') || segments.includes('layouts');
}
