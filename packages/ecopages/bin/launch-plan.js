import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NODE_THIN_HOST_PATH = fileURLToPath(new URL('./node-thin-host.js', import.meta.url));
const LOADER_HOOKS_PATH = fileURLToPath(new URL('./ecopages-loader-hooks.cjs', import.meta.url));
const DEFAULT_INTERNAL_WORK_DIR = '.eco';

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
	if (options.runtime === 'bun' || options.runtime === 'node' || options.runtime === 'node-experimental') {
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
		bunArgs.push('--preload', 'eco.config.ts');
	}

	bunArgs.push(entryFile, ...args);

	if (options.reactFastRefresh) {
		bunArgs.push('--react-fast-refresh');
	}

	return bunArgs;
}

export function buildNodeArgs(args, options, entryFile) {
	const nodeArgs = [];

	if (options.watch) nodeArgs.push('--watch');

	nodeArgs.push('--require', LOADER_HOOKS_PATH, NODE_THIN_HOST_PATH, entryFile, ...args);

	if (options.reactFastRefresh) {
		nodeArgs.push('--react-fast-refresh');
	}

	return nodeArgs;
}

export function resolveNodeRuntimeManifestPath(projectDir = process.cwd()) {
	return path.join(path.resolve(projectDir), DEFAULT_INTERNAL_WORK_DIR, 'runtime', 'node-runtime-manifest.json');
}

export async function createNodeRuntimeManifestFile(
	entryFile,
	options = {
		cwd: process.cwd(),
		env: process.env,
	},
) {
	const projectDir = path.resolve(options.cwd ?? process.cwd());
	const configPath = path.join(projectDir, 'eco.config.ts');
	const manifestFilePath = options.manifestFilePath ?? resolveNodeRuntimeManifestPath(projectDir);

	if (!existsSync(configPath)) {
		throw new Error('The Node thin-host runtime requires eco.config.ts in the current project root.');
	}

	const manifest = {
		runtime: 'node',
		appRootDir: projectDir,
		sourceRootDir: path.join(projectDir, 'src'),
		distDir: path.join(projectDir, 'dist'),
		workDir: path.join(projectDir, DEFAULT_INTERNAL_WORK_DIR),
		modulePaths: {
			config: configPath,
			entry: path.resolve(projectDir, entryFile),
		},
	};

	mkdirSync(path.dirname(manifestFilePath), { recursive: true });
	writeFileSync(manifestFilePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

	return manifestFilePath;
}

export async function createLaunchPlan(args, options = {}, entryFile = 'app.ts') {
	const hasConfig = existsSync('eco.config.ts');
	const envOverrides = buildEnvOverrides(options);
	const runtime = detectRuntime(options);
	const env = { ...process.env, ...envOverrides };

	if (runtime === 'node' || runtime === 'node-experimental') {
		const manifestFilePath = await createNodeRuntimeManifestFile(entryFile, { env });

		return {
			runtime,
			executionStrategy: 'node-thin-host',
			command: 'node',
			commandArgs: buildNodeArgs(args, options, entryFile),
			envOverrides,
			env: {
				...env,
				ECOPAGES_NODE_RUNTIME_MANIFEST_PATH: manifestFilePath,
			},
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
