import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import {
	resolveEcoConfigPath,
	resolveEmittedEcoConfigPath,
	resolveProductionServerEntry,
	resolveProductionDistDir,
	assertProductionConfigIdentity,
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
		distDir: resolverOptions.distDir,
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

	if (userAgent.startsWith('bun/') || process.versions.bun) {
		return 'bun';
	}

	return 'node';
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
 * In `start` mode, the server bundle of one build output directory is used
 * directly: `options.distDir` names it, otherwise the only directory below the
 * working directory that holds `.server/manifest.json`. A missing or ambiguous
 * bundle throws an error that says how to fix it.
 *
 * In `build`, `dev`, `preview`, and `types` modes, the source entry file is executed via tsx
 * on Node, or as `bun run` with the same forwarded arguments. `--watch` is added for both
 * when watch mode is on.
 *
 * @param {string[]} args - Arguments forwarded to the entry file.
 * @param {object} options - CLI options (nodeEnv, runtime, port, etc.).
 * @param {string} entryFile - Path to the entry file (default: `app.ts`).
 * @param {'build' | 'dev' | 'preview' | 'start' | 'types'} launchMode - The CLI command mode.
 * @returns {{ runtime: string, command: string, commandArgs: string[], envOverrides: object, env: object }}
 * @throws {Error} When `launchMode` is `start` and no single bundle can be selected.
 */

export async function createLaunchPlan(args, options, entryFile, launchMode) {
	const resolvedOptions = options ?? {};
	const resolvedEntryFile = entryFile ?? 'app.ts';
	const { envOverrides, env } = buildLaunchEnv(resolvedOptions);
	const runtime = detectRuntime(resolvedOptions);
	const resolvedLaunchMode = inferLaunchMode(args, launchMode);
	const shouldUseBundle = usesProductionBundle(resolvedLaunchMode);
	const distDir = shouldUseBundle
		? await resolveProductionDistDir({ cwd: process.cwd(), distDir: resolvedOptions.distDir })
		: undefined;
	const isExplicitConfig = Boolean(resolvedOptions.configFile || process.env.ECOPAGES_CONFIG_FILE);
	const resolvedConfigFile = resolveEcoConfigFilePath(resolvedOptions, process.cwd(), {
		preferEmitted: shouldUseBundle && !isExplicitConfig,
		distDir,
	});

	if (shouldUseBundle) {
		const distServerApp = resolveProductionServerEntry(process.cwd(), distDir);
		if (!distServerApp) {
			throw new Error(
				`Production server entry not found in ${path.relative(process.cwd(), distDir) || '.'}. Run \`ecopages build\` again.`,
			);
		}
		assertProductionConfigIdentity(process.cwd(), resolvedConfigFile, {
			isExplicitOverride: isExplicitConfig,
			distDir,
		});
		const runtimeConfigFile = resolveEmittedEcoConfigPath(process.cwd(), distDir) ?? resolvedConfigFile;
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

	const commandArgs = [];
	if (resolvedOptions.watch) {
		commandArgs.push('--watch');
	}
	commandArgs.push('run', resolvedEntryFile, ...args);

	return {
		runtime,
		command: 'bun',
		commandArgs,
		envOverrides,
		env,
	};
}
