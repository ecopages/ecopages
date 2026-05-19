import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function buildEnvOverrides(options) {
	const env = {};
	if (options.port) env.ECOPAGES_PORT = String(options.port);
	if (options.hostname) env.ECOPAGES_HOSTNAME = options.hostname;
	if (options.baseUrl) env.ECOPAGES_BASE_URL = options.baseUrl;
	if (options.debug) env.ECOPAGES_LOGGER_DEBUG = 'true';
	if (options.nodeEnv) env.NODE_ENV = options.nodeEnv;
	return env;
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

export function buildBunArgs(args, options, entryFile, hasConfig) {
	const bunArgs = [];

	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (hasConfig) {
		bunArgs.push('--preload', './eco.config.ts');
	}

	bunArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		bunArgs.push('--react-fast-refresh');
	}

	return bunArgs;
}

export function resolveTsxCliPath() {
	try {
		return require.resolve('tsx/cli');
	} catch {
		throw new Error(
			'Unable to resolve the packaged tsx runtime required for Node.js launches. Reinstall ecopages and its dependencies, or use the Bun runtime instead.',
		);
	}
}

export async function createLaunchPlan(args, options = {}, entryFile = 'app.ts') {
	const envOverrides = buildEnvOverrides(options);
	const runtime = detectRuntime(options);
	const env = { ...process.env, ...envOverrides };

	if (runtime === 'node') {
		const tsxCliPath = resolveTsxCliPath();
		const nodeArgs = [entryFile, ...args];

		return {
			runtime,
			command: process.execPath,
			commandArgs: [tsxCliPath, ...nodeArgs],
			envOverrides,
			env,
		};
	}

	return {
		runtime,
		command: 'bun',
		commandArgs: buildBunArgs(args, options, entryFile, existsSync('eco.config.ts')),
		envOverrides,
		env,
	};
}
