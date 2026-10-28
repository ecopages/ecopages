import path from 'node:path';
import { isPathInside } from '../utils/path-containment.ts';
import { isWorkspacePackageFile } from './workspace-package-watch-roots.ts';

export type ProjectWatcherIgnorePaths = {
	workDir: string;
	distDir: string;
};

/**
 * @remarks
 * A path predicate filters node_modules, VCS metadata, and scoped artifact dirs
 * from indexing and reported changes without traversing symlinked monorepo node_modules.
 */
export function createProjectWatcherIgnorePredicate(
	absolutePaths: ProjectWatcherIgnorePaths,
	workspacePackageRoots: readonly string[] = [],
): (watchedPath: string) => boolean {
	const ignoredDirectories = [absolutePaths.workDir, absolutePaths.distDir];

	return (watchedPath: string): boolean => {
		const segments = path.normalize(watchedPath).split(path.sep);
		if (segments.includes('node_modules') || segments.includes('.git')) {
			return true;
		}
		if (
			workspacePackageRoots.some(
				(root) =>
					isWorkspacePackageFile(watchedPath, [root]) &&
					path
						.relative(root, watchedPath)
						.split(path.sep)
						.some((segment) => segment.startsWith('.')),
			)
		)
			return true;

		return ignoredDirectories.some((directory) => isPathInside(watchedPath, directory));
	};
}
