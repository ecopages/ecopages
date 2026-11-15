/**
 * What the `ecopages` CLI reads before it starts an app process.
 *
 * @remarks
 * The CLI parent process only plans the launch and spawns the app, which loads the build and config modules
 * itself. This entry keeps the parent off the `build` and `config` barrels, so each command starts without
 * loading the bundler.
 * @module
 */
export {
	ECOPAGES_DEV_RESTART_EXIT_CODE,
	ECOPAGES_DEV_RESTART_REASON_ENV,
	ECOPAGES_ENTRY_WATCH_ENV,
	getDevEnvFileNames,
	resolveDevelopmentRecoveryWatch,
} from './dev/development-restart.ts';
export { ENTRY_COMMAND_FLAGS, getEntryCommandFlagNames } from './utils/entry-command-flags.ts';
export { getEcopagesEnv, isEcopagesEnvEnabled } from './env.ts';
export { resolveEcoConfigPath, resolveEmittedEcoConfigPath } from './config/resolve-eco-config-path.ts';
export {
	assertProductionConfigIdentity,
	resolveProductionDistDir,
	resolveProductionServerEntry,
} from './build/server-bundle-deploy-manifest.ts';
