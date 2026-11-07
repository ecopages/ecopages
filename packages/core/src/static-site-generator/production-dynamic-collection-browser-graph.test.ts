import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeApp } from '../adapters/node/create-app.ts';
import type { BuildAdapter, BuildResult } from '../build/build-adapter.ts';
import { BuildQueue } from '../build/runtime/build-queue.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { appLogger } from '../global/app-logger.ts';
import { loadEcoPagesConfig } from '../config/load-eco-config.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { copyFixtureApp } from '../../__fixtures__/app/copy-fixture-app.ts';

const CLI_ARGS = { preview: false, build: false, start: false, dev: false, serveOnly: false, keepGoing: false };
const SERVER_OPTIONS = { hostname: '127.0.0.1', port: 0 };

const CACHE_FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../../e2e/fixtures/cache');

/** Every file under `dir` with its modification time, so a test can tell that nothing was written. */
function snapshotFiles(dir: string): Record<string, number> {
	return Object.fromEntries(
		readdirSync(dir, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const filePath = path.join(entry.parentPath, entry.name);
				return [path.relative(dir, filePath), statSync(filePath).mtimeMs];
			}),
	);
}

declare global {
	var __ecoDynamicCollectionStaticPropsRuns: number | undefined;
}

function installThrowingBuildAdapter(appConfig: EcoPagesAppConfig): void {
	const throwing: BuildAdapter = {
		async build(): Promise<BuildResult> {
			throw new Error('production must not build browser assets');
		},
		resolve(): string {
			throw new Error('production must not resolve through the build adapter');
		},
	};
	const runtime = requireAppRuntime(appConfig);
	runtime.buildAdapter = throwing;
	runtime.buildQueue = new BuildQueue(throwing);
}

describe('ecopages start from a complete production build', () => {
	const copiedApps: string[] = [];

	afterEach(async () => {
		for (const appDir of copiedApps.splice(0)) rmSync(appDir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		globalThis.__ecoDynamicCollectionStaticPropsRuns = undefined;
	});

	async function buildDynamicCollectionApp(): Promise<string> {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(CACHE_FIXTURE_DIR);
		copiedApps.push(appDir);
		writeFileSync(
			path.join(appDir, 'app.ts'),
			[
				"import { createApp } from '@ecopages/core/create-app';",
				'',
				'const app = await createApp();',
				'await app.start();',
				'',
			].join('\n'),
		);
		writeFileSync(
			path.join(appDir, 'src/pages/health.api.ts'),
			[
				"import { defineGet } from '@ecopages/core';",
				'',
				'export const GET = defineGet({',
				"	handler: async ({ response }) => response.json({ status: 'ok' }),",
				'});',
				'',
			].join('\n'),
		);
		const postsDir = path.join(appDir, 'src/pages/posts');
		const componentsDir = path.join(appDir, 'src/components');
		mkdirSync(postsDir, { recursive: true });
		mkdirSync(componentsDir, { recursive: true });
		writeFileSync(path.join(componentsDir, 'plain.script.ts'), "console.log('plain-island');\n");
		writeFileSync(path.join(componentsDir, 'chart.script.ts'), "console.log('chart-island');\n");
		writeFileSync(
			path.join(componentsDir, 'plain.ts'),
			[
				"import { eco } from '@ecopages/core';",
				'',
				'export const Plain = eco.component({',
				'	render: () => \'<div data-testid="entry-plain">Plain entry</div>\',',
				'});',
				'',
			].join('\n'),
		);
		writeFileSync(
			path.join(componentsDir, 'chart.ts'),
			[
				"import { eco } from '@ecopages/core';",
				'',
				'export const Chart = eco.component({',
				'	render: () => \'<div data-testid="entry-chart">Chart entry</div>\',',
				'});',
				'',
			].join('\n'),
		);
		writeFileSync(
			path.join(postsDir, '[slug].ts'),
			[
				"import { eco } from '@ecopages/core';",
				"import { BaseLayout } from '../../layouts/base-layout';",
				"import { Chart } from '../../components/chart';",
				"import { Plain } from '../../components/plain';",
				'',
				'type PostProps = { slug: string };',
				'',
				'export default eco.page<PostProps>({',
				"	cache: 'dynamic',",
				'	staticPaths: async () => ({',
				"		paths: [{ params: { slug: 'plain' } }, { params: { slug: 'chart' } }],",
				'	}),',
				'	staticProps: async ({ pathname }) => {',
				'		globalThis.__ecoDynamicCollectionStaticPropsRuns = (globalThis.__ecoDynamicCollectionStaticPropsRuns ?? 0) + 1;',
				'		return { props: { slug: String(pathname.params.slug) } };',
				'	},',
				'	dependencies: async ({ props }) => ({',
				'		components: [BaseLayout, props.slug === "chart" || props.slug === "unlisted" ? Chart : Plain],',
				"		scripts: [{ src: props.slug === 'chart' || props.slug === 'unlisted' ? '../../components/chart.script.ts' : '../../components/plain.script.ts', lazy: { 'on:visible': true } }],",
				'	}),',
				'	metadata: ({ props }) => ({',
				'		title: props.slug,',
				"		description: 'Dynamic collection entry',",
				'	}),',
				'	render: ({ slug }) => {',
				"		const Entry = slug === 'chart' || slug === 'unlisted' ? Chart : Plain;",
				'		return `${BaseLayout({',
				'			children: `<article data-testid="post-${slug}">${Entry({})}</article>`,',
				'		})}`;',
				'	},',
				'});',
				'',
			].join('\n'),
		);

		const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
		const buildApp = await createNodeApp({
			appConfig,
			serverOptions: SERVER_OPTIONS,
			cliArgs: { ...CLI_ARGS, build: true },
		});
		try {
			await buildApp.start();
		} finally {
			await buildApp.stop();
		}
		return appDir;
	}

	async function startApp(appDir: string, options: { fromCompleteDist: boolean }) {
		const startConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
		const app = await createNodeApp({
			appConfig: startConfig,
			serverOptions: SERVER_OPTIONS,
			cliArgs: { ...CLI_ARGS, start: options.fromCompleteDist },
			serverBundleDir: options.fromCompleteDist ? path.join(appDir, 'dist/server') : undefined,
		});
		await app.start();
		return { app, startConfig };
	}

	it('serves every Dynamic collection Page entry the ledger records, and fails one it does not, without compiling or writing', async () => {
		const appDir = await buildDynamicCollectionApp();
		const ledgerPath = path.join(appDir, 'dist/server/processed-assets.json');
		const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
			entries: Array<{ key: string; asset: { bundledSourceFilepaths?: string[] } }>;
		};
		const builtFromChartScript = (entry: (typeof ledger.entries)[number]) =>
			(entry.asset.bundledSourceFilepaths ?? []).some((filePath) => filePath.endsWith('chart.script.ts'));
		expect(ledger.entries.some(builtFromChartScript)).toBe(true);
		ledger.entries = ledger.entries.filter((entry) => !builtFromChartScript(entry));
		writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, '\t')}\n`);
		globalThis.__ecoDynamicCollectionStaticPropsRuns = 0;

		const { app, startConfig } = await startApp(appDir, { fromCompleteDist: true });
		try {
			expect(globalThis.__ecoDynamicCollectionStaticPropsRuns).toBe(0);
			expect(requireAppRuntime(startConfig).processedAssets.isSealed).toBe(true);
			const errorSpy = vi.spyOn(appLogger, 'error');
			installThrowingBuildAdapter(startConfig);
			const distBeforeRequests = snapshotFiles(path.join(appDir, 'dist'));

			const plain = await app.fetch(new Request('http://localhost:3000/posts/plain'));
			const chart = await app.fetch(new Request('http://localhost:3000/posts/chart'));
			const unlisted = await app.fetch(new Request('http://localhost:3000/posts/unlisted'));
			expect(plain.status).toBe(200);
			expect(chart.status).toBe(500);
			expect(unlisted.status).toBe(500);
			expect(await plain.text()).toContain('data-testid="entry-plain"');
			const loggedErrors = errorSpy.mock.calls.flat().map(String).join('\n');
			expect(loggedErrors).toContain('The production build did not record the script');
			expect(loggedErrors).toContain('Run `ecopages build` again.');
			expect(snapshotFiles(path.join(appDir, 'dist'))).toEqual(distBeforeRequests);
		} finally {
			await app.stop();
		}
	});

	it('restores no ledger when it starts from the source tree', async () => {
		const appDir = await buildDynamicCollectionApp();

		const { app, startConfig } = await startApp(appDir, { fromCompleteDist: false });
		try {
			const ledger = requireAppRuntime(startConfig).processedAssets;
			expect(ledger.isSealed).toBe(false);
			expect(ledger.hasBrowserBuild).toBe(false);
		} finally {
			await app.stop();
		}
	});
});
