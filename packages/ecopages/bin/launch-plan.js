import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
	resolveEcoConfigPath,
	resolveEmittedEcoConfigPath,
	assertProductionConfigIdentity,
	resolveProductionServerBundle,
} from '@ecopages/core/config';
import { ECOPAGES_ENTRY_WATCH_ENV, getDevEnvFileNames } from '@ecopages/core/dev/development-restart';

const nodeRequirePreload = import.meta.resolve('./node-require-preload.js');
const tsxLoader = import.meta.resolve('tsx/esm');

function getEnvFilePaths(nodeEnv) {
	return getDevEnvFileNames(nodeEnv).filter((envFile) => existsSync(envFile));
}

export function buildEnvOverrides(options) {
	const env = {};
	if (options.port) env.ECOPAGES_PORT = String(options.port);
	if (options.hostname) env.ECOPAGES_HOSTNAME = options.hostname;
	if (options.baseUrl) env.ECOPAGES_BASE_URL = options.baseUrl;
	if (options.debug) env.ECOPAGES_LOGGER_DEBUG = 'true';
	if (options.nodeEnv) env.NODE_ENV = options.nodeEnv;
	if (options.entryFile) env.ECOPAGES_ENTRY_FILE = options.entryFile;
	if (options.configFile) {
		env.ECOPAGES_CONFIG_FILE = path.isAbsolute(options.configFile)
			? options.configFile
			: path.resolve(process.cwd(), options.configFile);
	}
	if (options.watch) {
		env[ECOPAGES_ENTRY_WATCH_ENV] = '1';
	}
	return env;
}

export function resolveEcoConfigFilePath(options = {}, cwd = process.cwd(), resolverOptions = {}) {
	return resolveEcoConfigPath({
		configFile: options.configFile,
		cwd,
		required: false,
		preferEmitted: resolverOptions.preferEmitted,
		serverBundleDirectory: resolverOptions.serverBundleDirectory,
	});
}

export function buildLaunchEnv(options) {
	const envOverrides = buildEnvOverrides(options);
	const envFileValues = getEnvFilePaths(options.nodeEnv).reduce((env, envFile) => {
		return { ...env, ...parseEnv(readFileSync(envFile, 'utf8')) };
	}, {});

	return {
		envOverrides,
		env: { ...envFileValues, ...process.env, ...envOverrides },
	};
}

/**
 * Picks the runtime for the app process.
 *
 * @remarks
 * Bun runs the app when the command was launched through Bun (`bun dev`,
 * `bun run dev`, `bunx ecopages`), when the CLI itself runs on Bun, or with
 * `--runtime bun`. Every other launcher gets Node. The user-agent check is
 * needed because Bun honours the CLI's `node` shebang, so the CLI process is
 * Node even when Bun launched it.
 */
export function detectRuntime(options = {}) {
	if (options.runtime === 'bun' || options.runtime === 'node') {
		return options.runtime;
	}

	const userAgent = process.env.npm_config_user_agent || '';

	if (userAgent.startsWith('bun/') || typeof Bun !== 'undefined') {
		return 'bun';
	}

	return 'node';
}

export function buildBunArgs(args, options, entryFile, configFilePath) {
	const bunArgs = [];

	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (configFilePath) {
		bunArgs.push('--preload', configFilePath);
	}

	bunArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		bunArgs.push('--react-fast-refresh');
	}

	return bunArgs;
}

function usesProductionBundle(launchMode) {
	return launchMode === 'start';
}

function inferLaunchMode(args, launchMode) {
	if (launchMode) {
		return launchMode;
	}

	if (args.includes('--build')) {
		return 'build';
	}

	if (args.includes('--preview')) {
		return 'preview';
	}

	if (args.includes('--dev')) {
		return 'dev';
	}

	return 'start';
}

/**
 * Builds the command and environment needed to launch the app.
 *
 * In `start` mode, the selected production server bundle is used directly.
 * `distDir` selects one explicitly; otherwise exactly one bundle is discovered
 * below the app root. Missing and ambiguous bundles produce actionable errors.
 *
 * In `build`, `dev`, `preview`, and `types` modes, the source entry file is executed via tsx
 * (Node) or Bun's native runtime with the appropriate loader flags.
 *
 * @param {string[]} args - Arguments forwarded to the entry file.
 * @param {object} options - CLI options (nodeEnv, runtime, port, etc.).
 * @param {string} entryFile - Path to the entry file (default: `app.ts`).
 * @param {'build' | 'dev' | 'preview' | 'start' | 'types'} launchMode - The CLI command mode.
 * @returns {{ runtime: string, command: string, commandArgs: string[], envOverrides: object, env: object }}
 * @throws {Error} When `launchMode` is `start` and the bundle does not exist.
 */

export function createLaunchPlan(args, options, entryFile, launchMode) {
	const resolvedOptions = options ?? {};
	const resolvedEntryFile = entryFile ?? 'app.ts';
	const { envOverrides, env } = buildLaunchEnv(resolvedOptions);
	const runtime = detectRuntime(resolvedOptions);
	const resolvedLaunchMode = inferLaunchMode(args, launchMode);
	const shouldUseBundle = usesProductionBundle(resolvedLaunchMode);
	if (shouldUseBundle) {
		return createProductionBundleLaunchPlan(args, resolvedOptions, runtime, envOverrides, env);
	}

	const resolvedConfigFile = resolveEcoConfigFilePath(resolvedOptions, process.cwd());

	if (runtime === 'node') {
		return createNodeSourceLaunchPlan(args, resolvedOptions, resolvedEntryFile, envOverrides, env);
	}

	return {
		runtime,
		command: 'bun',
		commandArgs: buildBunArgs(args, resolvedOptions, resolvedEntryFile, resolvedConfigFile),
		envOverrides,
		env,
	};
}

function createProductionBundleLaunchPlan(args, options, runtime, envOverrides, env) {
	const cwd = process.cwd();
	const productionBundle = resolveProductionServerBundle({ cwd, distDir: options.distDir });
	const isExplicitConfig = Boolean(options.configFile || process.env.ECOPAGES_CONFIG_FILE);
	const resolvedConfigFile = resolveEcoConfigFilePath(options, cwd, {
		preferEmitted: !isExplicitConfig,
		serverBundleDirectory: productionBundle.serverBundleDirectory,
	});
	assertProductionConfigIdentity(cwd, resolvedConfigFile, {
		isExplicitOverride: isExplicitConfig,
		serverBundleDirectory: productionBundle.serverBundleDirectory,
	});
	const runtimeConfigFile =
		resolveEmittedEcoConfigPath(cwd, productionBundle.serverBundleDirectory) ?? resolvedConfigFile;
	if (runtimeConfigFile) {
		envOverrides.ECOPAGES_CONFIG_FILE = runtimeConfigFile;
		env.ECOPAGES_CONFIG_FILE = runtimeConfigFile;
	}

	return runtime === 'node'
		? {
				runtime,
				command: process.execPath,
				commandArgs: [productionBundle.serverEntryPath, ...args],
				envOverrides,
				env,
			}
		: {
				runtime,
				command: 'bun',
				commandArgs: ['run', productionBundle.serverEntryPath, ...args],
				envOverrides,
				env,
			};
}

function createNodeSourceLaunchPlan(args, options, entryFile, envOverrides, env) {
	const commandArgs = ['--import', nodeRequirePreload, '--import', tsxLoader];
	if (options.watch) {
		commandArgs.push('--watch');
	}
	commandArgs.push(entryFile, ...args);

	return {
		runtime: 'node',
		command: process.execPath,
		commandArgs,
		envOverrides,
		env,
	};
}
