import path from 'node:path';

export type ProjectWatcherIgnorePaths = {
	workDir: string;
	distDir: string;
};

/**
 * @remarks
 * chokidar v4+ no longer treats glob strings in `ignored` as patterns. A path
 * predicate keeps node_modules, VCS metadata, and scoped artifact dirs out of
 * the watch tree without descending into symlinked monorepo node_modules.
 */
export function createProjectWatcherIgnorePredicate(
	absolutePaths: ProjectWatcherIgnorePaths,
): (watchedPath: string) => boolean {
	const ignoredPrefixes = [absolutePaths.workDir, absolutePaths.distDir];

	return (watchedPath: string): boolean => {
		const segments = watchedPath.split(path.sep);
		if (segments.includes('node_modules') || segments.includes('.git')) {
			return true;
		}

		return ignoredPrefixes.some(
			(prefix) => watchedPath === prefix || watchedPath.startsWith(`${prefix}${path.sep}`),
		);
	};
}
