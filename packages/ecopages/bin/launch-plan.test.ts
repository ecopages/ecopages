import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildEnvOverrides,
	buildNodeArgs,
	buildBunArgs,
	createNodeRuntimeManifestFile,
	createLaunchPlan,
	detectRuntime,
	launchPlanRequiresExistingEntryFile,
	resolveNodeRuntimeManifestPath,
} from './launch-plan.js';

const originalUserAgent = process.env.npm_config_user_agent;

afterEach(() => {
	if (originalUserAgent === undefined) {
		delete process.env.npm_config_user_agent;
	} else {
		process.env.npm_config_user_agent = originalUserAgent;
	}
	process.chdir('/Users/andeeplus/github/ecopages');
});

describe('launch-plan', () => {
	function writeExperimentalRuntimeConfig(tempDir) {
		fs.writeFileSync(
			path.join(tempDir, 'eco.config.ts'),
			[
				'const rootDir = process.cwd();',
				'export default {',
				'\trootDir,',
				'\tloaders: new Map(),',
				'\tabsolutePaths: {',
				'\t\tconfig: `${rootDir}/eco.config.ts`,',
				'\t\tsrcDir: `${rootDir}/src`,',
				'\t\tdistDir: `${rootDir}/dist`,',
				'\t\tworkDir: `${rootDir}/.eco`,',
				'\t},',
				'\truntime: {},',
				'};',
			].join('\n'),
			'utf8',
		);
	}

	function writeImportMetaRuntimeConfig(tempDir) {
		fs.writeFileSync(
			path.join(tempDir, 'eco.config.ts'),
			[
				"import path from 'node:path';",
				'export default {',
				'\trootDir: import.meta.dirname,',
				'\tloaders: new Map(),',
				'\tabsolutePaths: {',
				"\t\tconfig: path.join(import.meta.dirname, 'eco.config.ts'),",
				"\t\tsrcDir: path.join(import.meta.dirname, 'src'),",
				"\t\tdistDir: path.join(import.meta.dirname, 'dist'),",
				"\t\tworkDir: path.join(import.meta.dirname, '.eco'),",
				'\t},',
				'\truntime: {},',
				'};',
			].join('\n'),
			'utf8',
		);
	}

	it('buildEnvOverrides maps CLI options onto environment variables', () => {
		expect(
			buildEnvOverrides({
				port: 4173,
				hostname: '127.0.0.1',
				baseUrl: 'https://example.test',
				debug: true,
				nodeEnv: 'production',
			}),
		).toEqual({
			ECOPAGES_PORT: '4173',
			ECOPAGES_HOSTNAME: '127.0.0.1',
			ECOPAGES_BASE_URL: 'https://example.test',
			ECOPAGES_LOGGER_DEBUG: 'true',
			NODE_ENV: 'production',
		});
	});

	it('detectRuntime defaults to node unless bun is explicit', () => {
		process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
		expect(detectRuntime()).toBe('node');
		expect(detectRuntime({ runtime: 'bun' })).toBe('bun');
		expect(detectRuntime({ runtime: 'node' })).toBe('node');
		expect(detectRuntime({ runtime: 'node-experimental' })).toBe('node-experimental');
	});

	it('buildNodeArgs preserves watch mode and fast refresh flags', () => {
		expect(buildNodeArgs(['--dev'], { watch: true, reactFastRefresh: true }, 'app.ts')).toEqual([
			'--watch',
			'--require',
			expect.stringMatching(/ecopages-loader-hooks\.cjs$/),
			expect.stringMatching(/node-thin-host\.js$/),
			'app.ts',
			'--dev',
			'--react-fast-refresh',
		]);
	});

	it('buildNodeArgs routes stable Node through the thin launcher', () => {
		expect(buildNodeArgs(['--dev'], { watch: true }, 'app.ts')).toEqual([
			'--watch',
			'--require',
			expect.stringMatching(/ecopages-loader-hooks\.cjs$/),
			expect.stringMatching(/node-thin-host\.js$/),
			'app.ts',
			'--dev',
		]);
	});

	it('buildBunArgs preloads eco.config.ts when present', () => {
		expect(buildBunArgs(['--dev'], { hot: true }, 'app.ts', true)).toEqual([
			'--hot',
			'run',
			'--preload',
			'eco.config.ts',
			'app.ts',
			'--dev',
		]);
	});

	it('createLaunchPlan routes node app launches through the thin host', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			writeExperimentalRuntimeConfig(tempDir);
			fs.writeFileSync(
				path.join(tempDir, 'app.ts'),
				[
					"import { EcopagesApp } from '@ecopages/core/create-app';",
					"import appConfig from './eco.config';",
					'const app = new EcopagesApp({ appConfig });',
					'await app.start();',
				].join('\n'),
				'utf8',
			);
			const plan = await createLaunchPlan(['--dev'], { watch: true, nodeEnv: 'development' }, 'app.ts');

			expect(plan).toMatchObject({
				runtime: 'node',
				executionStrategy: 'node-thin-host',
				command: 'node',
				envOverrides: { NODE_ENV: 'development' },
			});
			expect(plan.commandArgs).toEqual([
				'--watch',
				'--require',
				expect.stringMatching(/ecopages-loader-hooks\.cjs$/),
				expect.stringMatching(/node-thin-host\.js$/),
				'app.ts',
				'--dev',
			]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan preserves direct node entrypoints on the thin-host path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'server.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(['--dev'], { watch: true }, 'server.ts');

			expect(plan).toMatchObject({
				runtime: 'node',
				executionStrategy: 'node-thin-host',
				command: 'node',
			});
			expect(plan.commandArgs).toEqual([
				'--watch',
				'--require',
				expect.stringMatching(/ecopages-loader-hooks\.cjs$/),
				expect.stringMatching(/node-thin-host\.js$/),
				'server.ts',
				'--dev',
			]);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan uses bun direct runtime and preloads eco.config.ts', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(['--preview'], { runtime: 'bun' }, 'app.ts');

			expect(plan).toMatchObject({
				runtime: 'bun',
				executionStrategy: 'direct-runtime',
				command: 'bun',
			});
			expect(plan.commandArgs).toEqual(['run', '--preload', 'eco.config.ts', 'app.ts', '--preview']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createNodeRuntimeManifestFile writes the core-owned manifest under .eco/runtime', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			writeExperimentalRuntimeConfig(tempDir);
			const manifestFilePath = await createNodeRuntimeManifestFile('app.ts');
			const manifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'));
			const resolvedTempDir = fs.realpathSync(tempDir);

			expect(manifestFilePath).toBe(resolveNodeRuntimeManifestPath(resolvedTempDir));
			expect(manifest).toMatchObject({
				runtime: 'node',
				appRootDir: resolvedTempDir,
				sourceRootDir: path.join(resolvedTempDir, 'src'),
				distDir: path.join(resolvedTempDir, 'dist'),
				workDir: path.join(resolvedTempDir, '.eco'),
				modulePaths: {
					config: path.join(resolvedTempDir, 'eco.config.ts'),
					entry: path.join(resolvedTempDir, 'app.ts'),
				},
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createNodeRuntimeManifestFile does not evaluate eco.config.ts while writing the manifest', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			writeImportMetaRuntimeConfig(tempDir);
			const manifestFilePath = await createNodeRuntimeManifestFile('app.ts');
			const manifest = JSON.parse(fs.readFileSync(manifestFilePath, 'utf8'));
			const resolvedTempDir = fs.realpathSync(tempDir);

			expect(manifestFilePath).toBe(resolveNodeRuntimeManifestPath(resolvedTempDir));
			expect(manifest).toMatchObject({
				appRootDir: resolvedTempDir,
				sourceRootDir: path.join(resolvedTempDir, 'src'),
				distDir: path.join(resolvedTempDir, 'dist'),
				workDir: path.join(resolvedTempDir, '.eco'),
				modulePaths: {
					config: path.join(resolvedTempDir, 'eco.config.ts'),
					entry: path.join(resolvedTempDir, 'app.ts'),
				},
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('createLaunchPlan routes node-experimental through the thin host launcher', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			writeExperimentalRuntimeConfig(tempDir);
			const resolvedTempDir = fs.realpathSync(tempDir);
			const plan = await createLaunchPlan(
				['--dev'],
				{ runtime: 'node-experimental', nodeEnv: 'development' },
				'app.ts',
			);

			expect(plan).toMatchObject({
				runtime: 'node-experimental',
				executionStrategy: 'node-thin-host',
				command: 'node',
				envOverrides: { NODE_ENV: 'development' },
			});
			expect(plan.commandArgs).toEqual([
				'--require',
				expect.stringMatching(/ecopages-loader-hooks\.cjs$/),
				expect.stringMatching(/node-thin-host\.js$/),
				'app.ts',
				'--dev',
			]);
			expect(plan.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH).toBe(resolveNodeRuntimeManifestPath(resolvedTempDir));
			expect(JSON.parse(fs.readFileSync(plan.env.ECOPAGES_NODE_RUNTIME_MANIFEST_PATH, 'utf8'))).toMatchObject({
				runtime: 'node',
				modulePaths: {
					config: path.join(resolvedTempDir, 'eco.config.ts'),
					entry: path.join(resolvedTempDir, 'app.ts'),
				},
			});
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('launchPlanRequiresExistingEntryFile requires a concrete entry on every runtime path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const nodePlan = await createLaunchPlan(['--dev'], { nodeEnv: 'development' }, 'app.ts');
			expect(nodePlan.executionStrategy).toBe('node-thin-host');
			expect(launchPlanRequiresExistingEntryFile(nodePlan)).toBe(true);

			fs.writeFileSync(path.join(tempDir, 'server.ts'), 'await Promise.resolve();', 'utf8');
			const directNodePlan = await createLaunchPlan(['--dev'], { nodeEnv: 'development' }, 'server.ts');
			expect(directNodePlan.executionStrategy).toBe('node-thin-host');
			expect(launchPlanRequiresExistingEntryFile(directNodePlan)).toBe(true);

			const bunPlan = await createLaunchPlan(['--dev'], { runtime: 'bun' }, 'app.ts');
			expect(launchPlanRequiresExistingEntryFile(bunPlan)).toBe(true);

			const experimentalNodePlan = await createLaunchPlan(['--dev'], { runtime: 'node-experimental' }, 'app.ts');
			expect(launchPlanRequiresExistingEntryFile(experimentalNodePlan)).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
