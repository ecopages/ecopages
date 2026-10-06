import path from 'node:path';
import { isPathInside } from './path-containment.ts';

/**
 * One `additionalWatchPaths` entry resolved against the project root.
 *
 * @remarks
 * `base` is the absolute path the watcher subscribes to, because chokidar 4
 * and later take only literal paths. For a glob, `base` is built from the
 * pattern's segments before the first one with a glob character, and `glob`
 * is the rest of the pattern, matched against paths relative to `base`. Glob
 * characters in the root directory itself therefore never reach the matcher.
 */
export type AdditionalWatchPath = {
	base: string;
	glob?: string;
};

const GLOB_SEGMENT = /[*?[\]{}]/;

/**
 * @remarks
 * Only entries containing `*` count as globs; any other entry is a literal
 * path, brackets included. Inside a glob, `[[]` matches a literal `[`: Node's
 * `path.matchesGlob` does not treat `\[` as an escape.
 */
export function resolveAdditionalWatchPath(pattern: string, rootDir: string): AdditionalWatchPath {
	if (!pattern.includes('*')) {
		return { base: path.resolve(rootDir, pattern) };
	}

	const segments = pattern.split('/');
	const firstGlobIndex = segments.findIndex((segment) => GLOB_SEGMENT.test(segment));
	const staticPrefix = segments.slice(0, firstGlobIndex).join('/') || (firstGlobIndex > 0 ? '/' : '');
	return { base: path.resolve(rootDir, staticPrefix), glob: segments.slice(firstGlobIndex).join('/') };
}

/**
 * @remarks
 * A path segment starting with `.` must match a pattern segment that starts
 * with `.`. Node's `path.matchesGlob` already behaves this way and Bun's does
 * not, so the check keeps both runtimes consistent.
 */
function allowsDotSegments(relativePath: string, glob: string): boolean {
	const dotPatternSegments = glob.split('/').filter((segment) => segment.startsWith('.'));
	return relativePath
		.split('/')
		.every(
			(segment) =>
				!segment.startsWith('.') || dotPatternSegments.some((pattern) => path.matchesGlob(segment, pattern)),
		);
}

function relativeToBase(filePath: string, base: string): string | undefined {
	return isPathInside(filePath, base)
		? path.relative(base, path.resolve(filePath)).split(path.sep).join('/')
		: undefined;
}

export function matchesAdditionalWatchPath(filePath: string, watchPath: AdditionalWatchPath): boolean {
	if (!watchPath.glob) {
		return isPathInside(filePath, watchPath.base);
	}

	const relativePath = relativeToBase(filePath, watchPath.base);
	return (
		relativePath !== undefined &&
		allowsDotSegments(relativePath, watchPath.glob) &&
		path.matchesGlob(relativePath, watchPath.glob)
	);
}

/** Returns whether a directory under a glob's base can hold files the glob matches. */
export function mayContainAdditionalWatchMatches(directory: string, watchPath: AdditionalWatchPath): boolean {
	const relativePath = relativeToBase(directory, watchPath.base);
	return relativePath !== undefined && (!watchPath.glob || allowsDotSegments(relativePath, watchPath.glob));
}
