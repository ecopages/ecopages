export type EcopagesEnvironmentVariable =
	| 'ECOPAGES_BASE_URL'
	| 'ECOPAGES_BENCH'
	| 'ECOPAGES_BENCH_VERBOSE'
	| 'ECOPAGES_CONFIG_FILE'
	| 'ECOPAGES_DEBUG'
	| 'ECOPAGES_DEV_PREWARM_STATIC_ROUTES_PARALLELISM'
	| 'ECOPAGES_DEV_RESTART_REASON'
	| 'ECOPAGES_DEV_TOOLBAR'
	| 'ECOPAGES_DIST_DIR'
	| 'ECOPAGES_ENTRY_FILE'
	| 'ECOPAGES_ENTRY_WATCH'
	| 'ECOPAGES_HOSTNAME'
	| 'ECOPAGES_LIT_STATIC_RENDER_WORKER'
	| 'ECOPAGES_LOGGER_DEBUG'
	| 'ECOPAGES_PORT'
	| 'ECOPAGES_PREVIEW_SERVE_ONLY'
	| 'ECOPAGES_PROFILE_BUILD'
	| 'ECOPAGES_REQUEST_PIPELINE_METRICS'
	| 'ECOPAGES_ROLLDOWN_BUILD_METRICS'
	| 'ECOPAGES_STARTUP_TRACE'
	| 'ECOPAGES_STARTUP_TRACE_JSON'
	| 'ECOPAGES_UNIFIED_PAGES_GRAPH'
	| 'ECOPAGES_WATCH_CHANGE_DEBOUNCE_MS'
	| 'ECOPAGES_WORK_DIR';

const nodeEnvironmentVariable = 'NODE_ENV';

export type EcopagesBooleanEnvironmentVariable =
	| 'ECOPAGES_BENCH'
	| 'ECOPAGES_BENCH_VERBOSE'
	| 'ECOPAGES_DEBUG'
	| 'ECOPAGES_ENTRY_WATCH'
	| 'ECOPAGES_DEV_TOOLBAR'
	| 'ECOPAGES_LIT_STATIC_RENDER_WORKER'
	| 'ECOPAGES_LOGGER_DEBUG'
	| 'ECOPAGES_PREVIEW_SERVE_ONLY'
	| 'ECOPAGES_PROFILE_BUILD'
	| 'ECOPAGES_REQUEST_PIPELINE_METRICS'
	| 'ECOPAGES_ROLLDOWN_BUILD_METRICS'
	| 'ECOPAGES_STARTUP_TRACE'
	| 'ECOPAGES_UNIFIED_PAGES_GRAPH';

/** Reads a declared Ecopages environment variable from the provided environment or the current process. */
export function getEcopagesEnv(name: EcopagesEnvironmentVariable, environment?: NodeJS.ProcessEnv): string | undefined {
	return (environment ?? process.env)[name];
}

/** Treats the documented boolean values `true` and `1` as enabled. */
export function isEcopagesEnvEnabled(
	name: EcopagesBooleanEnvironmentVariable,
	environment?: NodeJS.ProcessEnv,
): boolean {
	const value = getEcopagesEnv(name, environment);
	return value === 'true' || value === '1';
}

export function isEcopagesEnvDisabled(
	name: EcopagesBooleanEnvironmentVariable,
	environment?: NodeJS.ProcessEnv,
): boolean {
	const value = getEcopagesEnv(name, environment);
	return value === 'false' || value === '0';
}

export function getNodeEnvironment(environment?: NodeJS.ProcessEnv): string | undefined {
	return environment === undefined ? process.env.NODE_ENV : environment[nodeEnvironmentVariable];
}

export function isDevelopmentRuntime(environment?: NodeJS.ProcessEnv): boolean {
	return getNodeEnvironment(environment) === 'development';
}

export function isProductionRuntime(environment?: NodeJS.ProcessEnv): boolean {
	return getNodeEnvironment(environment) === 'production';
}

/** Sets the runtime mode before a CLI command launches its app process.
 *
 * @remarks
 * Development preserves an explicitly supplied `NODE_ENV`; build and server commands force
 * production so the launched app uses production behavior.
 */
export function setRuntimeModeForCliCommand(isDevCommand: boolean): void {
	const environment = process.env;
	if (isDevCommand) {
		environment[nodeEnvironmentVariable] ??= 'development';
	} else {
		environment[nodeEnvironmentVariable] = 'production';
	}
}
