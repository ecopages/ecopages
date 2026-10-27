import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeApp } from '../adapters/node/create-app.ts';
import type { BuildAdapter, BuildResult } from '../build/build-adapter.ts';
import { BuildQueue } from '../build/runtime/build-queue.ts';
import type { EcoPagesAppConfig } from '../config/internal-types.ts';
import { loadEcoPagesConfig } from '../config/load-eco-config.ts';
import { requireAppRuntime } from '../utils/app-runtime.ts';
import { copyFixtureApp } from '../../__fixtures__/app/copy-fixture-app.ts';

const CLI_ARGS = { preview: false, build: false, start: false, dev: false, serveOnly: false, keepGoing: false };
const SERVER_OPTIONS = { hostname: '127.0.0.1', port: 0 };

const CACHE_FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../../e2e/fixtures/cache');

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

describe('production Dynamic collection Page browser graphs', () => {
	const copiedApps: string[] = [];

	afterEach(async () => {
		for (const appDir of copiedApps.splice(0)) rmSync(appDir, { recursive: true, force: true });
		vi.unstubAllEnvs();
	});

	it('serves every Dynamic collection Page entry after ecopages build with a throwing build adapter', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(CACHE_FIXTURE_DIR);
		copiedApps.push(appDir);
		const postsDir = path.join(appDir, 'src/pages/posts');
		const componentsDir = path.join(appDir, 'src/components');
		mkdirSync(postsDir, { recursive: true });
		mkdirSync(componentsDir, { recursive: true });
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
		writeFileSync(path.join(componentsDir, 'chart.script.ts'), "console.log('chart-island');\n");
		writeFileSync(
			path.join(componentsDir, 'chart.ts'),
			[
				"import { eco } from '@ecopages/core';",
				'',
				'export const Chart = eco.component({',
				'	dependencies: {',
				"		scripts: ['./chart.script.ts'],",
				'	},',
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
				'	staticProps: async ({ pathname }) => ({',
				'		props: { slug: String(pathname.params.slug) },',
				'	}),',
				'	dependencies: async ({ props }) => ({',
				'		components: [BaseLayout, props.slug === "chart" ? Chart : Plain],',
				'	}),',
				'	metadata: ({ props }) => ({',
				'		title: props.slug,',
				"		description: 'Dynamic collection entry',",
				'	}),',
				'	render: ({ slug }) => {',
				"		const Entry = slug === 'chart' ? Chart : Plain;",
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

		const app = await createNodeApp({
			appConfig,
			serverOptions: SERVER_OPTIONS,
			cliArgs: { ...CLI_ARGS, start: true },
		});
		try {
			await app.start();
			installThrowingBuildAdapter(appConfig);

			const plain = await app.fetch(new Request('http://localhost:3000/posts/plain'));
			const chart = await app.fetch(new Request('http://localhost:3000/posts/chart'));
			expect(plain.status).toBe(200);
			expect(chart.status).toBe(200);
			expect(await plain.text()).toContain('data-testid="entry-plain"');
			expect(await chart.text()).toContain('data-testid="entry-chart"');
		} finally {
			await app.stop();
		}
	});
});
