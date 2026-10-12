import path from 'node:path';
import { DEFAULT_ECOPAGES_DIST_DIR, DEFAULT_ECOPAGES_WORK_DIR } from '../config/constants.ts';
import { createProjectWatcherIgnorePredicate } from '../watchers/project-watcher-ignore.ts';
import { resolveWorkspacePackageWatchRoots } from '../watchers/workspace-package-watch-roots.ts';

/** Process exit code the CLI supervisor treats as a development restart request. */
export const ECOPAGES_DEV_RESTART_EXIT_CODE = 100;

/** Env var carrying a short restart reason for the next child process startup log. */
export const ECOPAGES_DEV_RESTART_REASON_ENV = 'ECOPAGES_DEV_RESTART_REASON';

/**
 * When set, the CLI entry watcher (`bun --watch` or `node --watch`) owns hard restarts;
 * core skips a second config-file exit for the same change.
 */
export const ECOPAGES_ENTRY_WATCH_ENV = 'ECOPAGES_ENTRY_WATCH';

/** Returns whether the runtime's entry watcher owns config-module restarts. */
export function entryWatcherOwnsConfig(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[ECOPAGES_ENTRY_WATCH_ENV] === '1';
}

/** Relative dotenv filenames loaded by the CLI, in precedence order. */
export function getDevEnvFileNames(nodeEnv = process.env.NODE_ENV): string[] {
	const envFiles = ['.env', '.env.local'];

	if (nodeEnv) {
		envFiles.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`);
	}

	return envFiles;
}

/**
 * What the CLI supervisor watches while a restarted development server starts or stays broken.
 *
 * @remarks
 * A broken config cannot say which files it imports, so the supervisor watches the whole project and
 * every linked workspace package. Dependencies, VCS metadata and the default work and build
 * directories are skipped, the same way the Project Watcher skips them.
 */
export function resolveDevelopmentRecoveryWatch(rootDir: string): {
	paths: string[];
	ignored: (watchedPath: string) => boolean;
} {
	const root = path.resolve(rootDir);
	const workspacePackageRoots = resolveWorkspacePackageWatchRoots(root);
	return {
		paths: [root, ...workspacePackageRoots],
		ignored: createProjectWatcherIgnorePredicate(
			{
				workDir: path.join(root, DEFAULT_ECOPAGES_WORK_DIR),
				distDir: path.join(root, DEFAULT_ECOPAGES_DIST_DIR),
			},
			workspacePackageRoots,
		),
	};
}
