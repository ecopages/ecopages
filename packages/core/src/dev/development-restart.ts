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
