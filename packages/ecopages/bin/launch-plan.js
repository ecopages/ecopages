import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const NODE_THIN_HOST_PATH = fileURLToPath(new URL('./node-thin-host.js', import.meta.url));
const NODE_RUNTIME_MANIFEST_WRITER_PATH = fileURLToPath(
	new URL('../../core/src/adapters/node/write-runtime-manifest.ts', import.meta.url),
);

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

	nodeArgs.push(NODE_THIN_HOST_PATH, entryFile, ...args);

	if (options.reactFastRefresh) {
		nodeArgs.push('--react-fast-refresh');
	}

	return nodeArgs;
}

export function resolveNodeRuntimeManifestPath(projectDir = process.cwd()) {
	return path.join(path.resolve(projectDir), '.eco', 'runtime', 'node-runtime-manifest.json');
}

export function resolveNodeRuntimeManifestWriterBundlePath(projectDir = process.cwd()) {
	return path.join(path.resolve(projectDir), '.eco', 'runtime', 'node-runtime-manifest-writer.mjs');
}

function getEsbuildLoaderForPath(filePath) {
	const extension = path.extname(filePath).toLowerCase();

	switch (extension) {
		case '.ts':
		case '.mts':
		case '.cts':
			return 'ts';
		case '.tsx':
			return 'tsx';
		case '.jsx':
			return 'jsx';
		case '.json':
			return 'json';
		default:
			return 'js';
	}
}

export async function bundleNodeRuntimeManifestWriter(configPath, projectDir = process.cwd()) {
	const bundlePath = resolveNodeRuntimeManifestWriterBundlePath(projectDir);
	const tsconfigPath = path.join(projectDir, 'tsconfig.json');
	const requireFromProject = createRequire(path.join(projectDir, 'package.json'));
	mkdirSync(path.dirname(bundlePath), { recursive: true });

	await esbuild.build({
		absWorkingDir: projectDir,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		outfile: bundlePath,
		logLevel: 'silent',
		write: true,
		tsconfig: existsSync(tsconfigPath) ? tsconfigPath : undefined,
		plugins: [
			{
				name: 'preserve-import-meta-paths',
				setup(build) {
					build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
						if (!args.path.startsWith(projectDir)) {
							return undefined;
						}

						const source = readFileSync(args.path, 'utf8')
							.replaceAll('import.meta.dirname', JSON.stringify(path.dirname(args.path)))
							.replaceAll('import.meta.filename', JSON.stringify(args.path));

						return {
							contents: source,
							loader: getEsbuildLoaderForPath(args.path),
						};
					});
				},
			},
			{
				name: 'resolve-third-party-runtime-files',
				setup(build) {
					build.onResolve({ filter: /^[@A-Za-z0-9][^:]*$/ }, (args) => {
						if (
							args.path.startsWith('./') ||
							args.path.startsWith('../') ||
							args.path.startsWith('/') ||
							args.path.startsWith('node:')
						) {
							return undefined;
						}

						if (args.path.startsWith('@ecopages/')) {
							return undefined;
						}

						return {
							path: requireFromProject.resolve(args.path),
							external: true,
						};
					});
				},
			},
		],
		stdin: {
			contents: [
				`import appConfig from ${JSON.stringify(path.resolve(configPath))};`,
				`import { writeBundledNodeRuntimeManifest } from ${JSON.stringify(NODE_RUNTIME_MANIFEST_WRITER_PATH)};`,
				'',
				'writeBundledNodeRuntimeManifest(appConfig, {',
				'\tentryModulePath: process.argv[2],',
				'\tmanifestFilePath: process.argv[3],',
				'});',
			].join('\n'),
			loader: 'ts',
			resolveDir: projectDir,
			sourcefile: 'node-runtime-manifest-entry.ts',
		},
	});

	return bundlePath;
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
	const bundlePath = await bundleNodeRuntimeManifestWriter(configPath, projectDir);

	const result = spawnSync(
		'node',
		[
			bundlePath,
			path.resolve(projectDir, entryFile),
			manifestFilePath,
		],
		{
			cwd: projectDir,
			env: options.env ?? process.env,
			encoding: 'utf8',
		},
	);

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
		throw new Error(`Failed to prepare the Node runtime manifest.${details ? `\n${details}` : ''}`);
	}

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