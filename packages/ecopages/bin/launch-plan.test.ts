import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildEnvOverrides,
	buildBunArgs,
	buildNodeArgs,
	createLaunchPlan,
	detectRuntime,
	launchPlanRequiresExistingEntryFile,
	resolveTsxCliPath,
} from './launch-plan.js';

const require = createRequire(import.meta.url);

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

	it('detectRuntime returns node when Bun is not available', () => {
		process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
		expect(detectRuntime()).toBe('node');
		expect(detectRuntime({ runtime: 'bun' })).toBe('bun');
		expect(detectRuntime({ runtime: 'node' })).toBe('node');
	});

	it('buildBunArgs preloads eco.config.ts when present', () => {
		expect(buildBunArgs(['--dev'], { hot: true }, 'app.ts', true)).toEqual([
			'--hot',
			'run',
			'--preload',
			'./eco.config.ts',
			'app.ts',
			'--dev',
		]);
	});

	it('buildNodeArgs imports eco.config.ts when present', () => {
		expect(buildNodeArgs(['--dev'], {}, 'app.ts', true)).toEqual([
			'--import',
			'./eco.config.ts',
			'app.ts',
			'--dev',
		]);
	});

	it('resolveTsxCliPath resolves the packaged tsx cli entry', () => {
		expect(resolveTsxCliPath()).toBe(require.resolve('tsx/cli'));
	});

	it('createLaunchPlan uses the packaged tsx cli for node runtime', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.env.npm_config_user_agent = 'pnpm/10.0.0 npm/? node/v24.0.0 darwin arm64';
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const plan = await createLaunchPlan(['--dev'], { runtime: 'node', nodeEnv: 'development' }, 'app.ts');

			expect(plan).toMatchObject({
				runtime: 'node',
				executionStrategy: 'direct-runtime',
				command: process.execPath,
			});
			expect(plan.commandArgs).toEqual([
				require.resolve('tsx/cli'),
				'--import',
				'./eco.config.ts',
				'app.ts',
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
			expect(plan.commandArgs).toEqual(['run', '--preload', './eco.config.ts', 'app.ts', '--preview']);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('launchPlanRequiresExistingEntryFile requires a concrete entry on every runtime path', async () => {
		const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'eco-cli-launch-plan-'));
		try {
			process.chdir(tempDir);
			fs.writeFileSync(path.join(tempDir, 'app.ts'), 'await Promise.resolve();', 'utf8');
			writeExperimentalRuntimeConfig(tempDir);

			const bunPlan = await createLaunchPlan(['--dev'], { nodeEnv: 'development' }, 'app.ts');
			expect(launchPlanRequiresExistingEntryFile(bunPlan)).toBe(true);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
