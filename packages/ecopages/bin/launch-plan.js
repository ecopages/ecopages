import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME } from '@ecopages/core/utils/resolve-entry-file';
import {
	resolveEcoConfigPath,
	resolveEmittedEcoConfigPath,
	assertProductionConfigIdentity,
} from '@ecopages/core/config';
import { ECOPAGES_ENTRY_WATCH_ENV, getDevEnvFileNames } from '@ecopages/core/dev/development-restart';

const SERVER_BUNDLE_MANIFEST_FILENAME = 'manifest.json';

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

export function detectRuntime(options = {}) {
	if (options.runtime === 'bun' || options.runtime === 'node') {
		return options.runtime;
	}

	const userAgent = process.env.npm_config_user_agent || '';

	if (userAgent.startsWith('bun/')) {
		return 'bun';
	}

	if (typeof Bun !== 'undefined') {
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
 * In `start` mode, the bundled server
 * entry at `dist/{SERVER_BUNDLE_DIR}/{SERVER_BUNDLE_FILENAME}` is used
 * directly. If the bundle is missing, an error is thrown directing the
 * caller to run `ecopages build` first.
 *
 * In `build`, `dev`, and `preview` modes, the source entry file is executed via tsx
 * (Node) or Bun's native runtime with the appropriate loader flags.
 *
 * @param {string[]} args - Arguments forwarded to the entry file.
 * @param {object} options - CLI options (nodeEnv, runtime, port, etc.).
 * @param {string} entryFile - Path to the entry file (default: `app.ts`).
 * @param {'build' | 'dev' | 'preview' | 'start'} launchMode - The CLI command mode.
 * @returns {{ runtime: string, command: string, commandArgs: string[], envOverrides: object, env: object }}
 * @throws {Error} When `launchMode` is `start` and the bundle does not exist.
 */

function resolveProductionServerEntry(cwd = process.cwd()) {
	const manifestPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_MANIFEST_FILENAME);
	if (existsSync(manifestPath)) {
		try {
			const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
			if (parsed?.serverEntry) {
				const fromManifest = path.isAbsolute(parsed.serverEntry)
					? parsed.serverEntry
					: path.join(path.dirname(manifestPath), parsed.serverEntry);
				if (existsSync(fromManifest)) {
					return fromManifest;
				}
			}
			if (parsed?.distDir) {
				const fromDistDir = path.join(parsed.distDir, SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
				if (existsSync(fromDistDir)) {
					return fromDistDir;
				}
			}
		} catch {
			// fall through to legacy path
		}
	}

	const legacyPath = path.join(cwd, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_FILENAME);
	return existsSync(legacyPath) ? legacyPath : undefined;
}

export function createLaunchPlan(args, options, entryFile, launchMode) {
	const resolvedOptions = options ?? {};
	const resolvedEntryFile = entryFile ?? 'app.ts';
	const { envOverrides, env } = buildLaunchEnv(resolvedOptions);
	const runtime = detectRuntime(resolvedOptions);
	const resolvedLaunchMode = inferLaunchMode(args, launchMode);
	const isExplicitConfig = Boolean(resolvedOptions.configFile || process.env.ECOPAGES_CONFIG_FILE);
	const resolvedConfigFile = resolveEcoConfigFilePath(resolvedOptions, process.cwd(), {
		preferEmitted: usesProductionBundle(resolvedLaunchMode) && !isExplicitConfig,
	});

	const distServerApp = resolveProductionServerEntry(process.cwd());
	const shouldUseBundle = usesProductionBundle(resolvedLaunchMode);
	const useBundle = shouldUseBundle && Boolean(distServerApp);

	if (shouldUseBundle && !useBundle) {
		throw new Error('No production bundle found. Run `ecopages build` before starting in production mode.');
	}

	if (useBundle) {
		assertProductionConfigIdentity(process.cwd(), resolvedConfigFile, { isExplicitOverride: isExplicitConfig });
		const runtimeConfigFile = resolveEmittedEcoConfigPath(process.cwd()) ?? resolvedConfigFile;
		if (runtimeConfigFile) {
			envOverrides.ECOPAGES_CONFIG_FILE = runtimeConfigFile;
			env.ECOPAGES_CONFIG_FILE = runtimeConfigFile;
		}
		if (runtime === 'node') {
			return {
				runtime,
				command: process.execPath,
				commandArgs: [distServerApp, ...args],
				envOverrides,
				env,
			};
		}

		return {
			runtime,
			command: 'bun',
			commandArgs: ['run', distServerApp, ...args],
			envOverrides,
			env,
		};
	}

	if (runtime === 'node') {
		const commandArgs = ['--import', nodeRequirePreload, '--import', tsxLoader];
		if (resolvedOptions.watch) {
			commandArgs.push('--watch');
		}
		commandArgs.push(resolvedEntryFile, ...args);

		return {
			runtime,
			command: process.execPath,
			commandArgs,
			envOverrides,
			env,
		};
	}

	return {
		runtime,
		command: 'bun',
		commandArgs: buildBunArgs(args, resolvedOptions, resolvedEntryFile, resolvedConfigFile),
		envOverrides,
		env,
	};
}
