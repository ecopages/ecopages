import { existsSync } from 'node:fs';

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

export function buildNodeArgs(args, options, entryFile, hasConfig) {
	const nodeArgs = [];

	if (hasConfig) {
		nodeArgs.push('--import', './eco.config.ts');
	}

	nodeArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		nodeArgs.push('--react-fast-refresh');
	}

	return nodeArgs;
}

export async function createLaunchPlan(args, options = {}, entryFile = 'app.ts') {
	const hasConfig = existsSync('eco.config.ts');
	const envOverrides = buildEnvOverrides(options);
	const runtime = detectRuntime(options);
	const env = { ...process.env, ...envOverrides };

	if (runtime === 'node') {
		return {
			runtime,
			executionStrategy: 'direct-runtime',
			command: 'tsx',
			commandArgs: buildNodeArgs(args, options, entryFile, hasConfig),
			envOverrides,
			env,
		};
	}

	return {
		runtime,
		executionStrategy: 'direct-runtime',
		command: 'bun',
		commandArgs: buildBunArgs(args, options, entryFile, hasConfig),
		envOverrides,
		env,
	};
}

export function launchPlanRequiresExistingEntryFile(launchPlan) {
	return launchPlan.executionStrategy !== 'config-only-bootstrap';
}
