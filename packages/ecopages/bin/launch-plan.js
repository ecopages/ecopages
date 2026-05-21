import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const nodeRequirePreload = import.meta.resolve('./node-require-preload.js');
const tsxLoader = import.meta.resolve('tsx/esm');

function getEnvFilePaths(nodeEnv) {
	const envFiles = ['.env', '.env.local'];

	if (nodeEnv) {
		envFiles.push(`.env.${nodeEnv}`, `.env.${nodeEnv}.local`);
	}

	return envFiles.filter((envFile) => existsSync(envFile));
}

export function buildEnvOverrides(options) {
	const env = {};
	if (options.port) env.ECOPAGES_PORT = String(options.port);
	if (options.hostname) env.ECOPAGES_HOSTNAME = options.hostname;
	if (options.baseUrl) env.ECOPAGES_BASE_URL = options.baseUrl;
	if (options.debug) env.ECOPAGES_LOGGER_DEBUG = 'true';
	if (options.nodeEnv) env.NODE_ENV = options.nodeEnv;
	return env;
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

export function buildBunArgs(args, options, entryFile, hasConfig) {
	const bunArgs = [];

	if (options.watch) bunArgs.push('--watch');
	if (options.hot) bunArgs.push('--hot');

	bunArgs.push('run');

	if (hasConfig) {
		bunArgs.push('--preload', `./eco.config.${'ts'}`);
	}

	bunArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		bunArgs.push('--react-fast-refresh');
	}

	return bunArgs;
}

export function createLaunchPlan(args, options = {}, entryFile = 'app.ts') {
	const { envOverrides, env } = buildLaunchEnv(options);
	const runtime = detectRuntime(options);

	if (runtime === 'node') {
		return {
			runtime,
			command: process.execPath,
			commandArgs: ['--import', nodeRequirePreload, '--import', tsxLoader, entryFile, ...args],
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
