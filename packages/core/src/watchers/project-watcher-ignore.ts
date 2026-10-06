import path from 'node:path';
import { isPathInside } from '../utils/path-containment.ts';

export type ProjectWatcherIgnorePaths = {
	workDir: string;
	distDir: string;
};

/**
 * @remarks
 * chokidar v4+ no longer treats glob strings in `ignored` as patterns. A path
 * predicate keeps node_modules, VCS metadata, and scoped artifact dirs out of
 * the watch tree without descending into symlinked monorepo node_modules.
 * chokidar hands the predicate forward-slash paths on Windows too, so the
 * path is normalised before its segments are compared.
 */
export function createProjectWatcherIgnorePredicate(
	absolutePaths: ProjectWatcherIgnorePaths,
): (watchedPath: string) => boolean {
	const ignoredDirectories = [absolutePaths.workDir, absolutePaths.distDir];

	return (watchedPath: string): boolean => {
		const segments = path.normalize(watchedPath).split(path.sep);
		if (segments.includes('node_modules') || segments.includes('.git')) {
			return true;
		}

		return ignoredDirectories.some((directory) => isPathInside(watchedPath, directory));
	};
}
