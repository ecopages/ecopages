import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../packages/core/src/adapters/create-app.ts';
import { loadEcoPagesConfig } from '../../../packages/core/src/config/index.ts';
import type { EcoPagesAppConfig } from '../../../packages/core/src/config/internal-types.ts';
import { BuildQueue } from '../../../packages/core/src/build/runtime/build-queue.ts';
import type { BuildAdapter } from '../../../packages/core/src/build/build-adapter.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from '../../../packages/core/src/build/server/server-modules-manifest.ts';
import { requireAppRuntime } from '../../../packages/core/src/utils/app-runtime.ts';
import { runWithProductionServerBundleDir } from '../../../packages/core/src/utils/server-bundle-context.ts';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

const ORIGIN = 'http://localhost:3000';
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const blogJsxDir = path.join(repoRoot, 'templates/blog-jsx');

const COLLECTION_PAGES = [
	{ path: '/', marker: 'Welcome' },
	{ path: '/posts/hello-world', marker: 'How this blog works' },
	{ path: '/posts/browser-router', marker: 'Content processor collections' },
	{ path: '/posts/ssr-benefits', marker: 'RSS and sitemap generation' },
] as const;

function throwingServerBuildAdapter(original: BuildAdapter): BuildAdapter {
	return {
		build: async (options) => {
			if (options.environment === 'server') {
				throw new Error('server build adapter must not run after ecopages build');
			}
			return original.build(options);
		},
		resolve: (importPath, rootDir) => original.resolve(importPath, rootDir),
	};
}

function runCliBuild(appDir: string): ReturnType<typeof spawnSync> {
	return spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
		cwd: appDir,
		env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
		encoding: 'utf8',
		timeout: 180_000,
	});
}

async function createProductionStartApp(appConfig: EcoPagesAppConfig, appDir: string) {
	const previousArgv = process.argv;
	try {
		process.argv = [process.execPath, path.join(appDir, 'server.js')];
		return await runWithProductionServerBundleDir(path.join(appDir, 'dist/server'), () => createApp({ appConfig }));
	} finally {
		process.argv = previousArgv;
	}
}

describe('production processors', () => {
	const appDirs: string[] = [];

	afterEach(async () => {
		vi.unstubAllEnvs();
		for (const appDir of appDirs.splice(0)) {
			rmSync(appDir, { recursive: true, force: true });
		}
	});

	it(
		'serves collection pages from the build output without Processor setup or .eco writes',
		{ timeout: 180_000 },
		async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(blogJsxDir);
			appDirs.push(appDir);
			const apiDir = path.join(appDir, 'src/pages/api');
			mkdirSync(apiDir, { recursive: true });
			writeFileSync(
				path.join(apiDir, 'health.api.ts'),
				"import { defineGet } from '@ecopages/core';\n\nexport const GET = defineGet({ handler: async ({ response }) => response.json({ ok: true }) });\n",
			);

			const built = runCliBuild(appDir);
			expect(built.error).toBeUndefined();
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

			const manifest = JSON.parse(
				readFileSync(path.join(appDir, 'dist/server', SERVER_MODULES_MANIFEST_FILENAME), 'utf8'),
			) as { modules: Record<string, string> };
			expect(
				Object.keys(manifest.modules).some((key) => key.endsWith('ecopages-content-processor/posts.ts')),
			).toBe(true);
			expect(
				Object.keys(manifest.modules).some((key) => key.endsWith('ecopages-content-processor/posts.server.ts')),
			).toBe(true);

			rmSync(path.join(appDir, '.eco'), { recursive: true, force: true });

			const appConfig = await loadEcoPagesConfig({
				cwd: appDir,
				configFile: path.join(appDir, 'eco.config.ts'),
			});
			for (const processor of appConfig.processors.values()) {
				vi.spyOn(processor, 'setup').mockImplementation(async () => {
					throw new Error(`${processor.name} setup() must not run after ecopages build`);
				});
			}

			const app = await createProductionStartApp(appConfig, appDir);
			const runtime = requireAppRuntime(appConfig);
			const throwing = throwingServerBuildAdapter(runtime.buildAdapter);
			runtime.buildAdapter = throwing;
			runtime.buildQueue = new BuildQueue(throwing);

			for (const route of COLLECTION_PAGES) {
				const response = await app.fetch(new Request(`${ORIGIN}${route.path}`));
				const body = await response.text();
				expect(response.status, `${route.path}: ${body}`).toBe(200);
				expect(body).toContain(route.marker);
			}

			const ecoDir = path.join(appDir, '.eco');
			const ecoFiles = existsSync(ecoDir)
				? readdirSync(ecoDir, { recursive: true, withFileTypes: true })
						.filter((entry) => entry.isFile())
						.map((entry) => path.relative(ecoDir, path.join(entry.parentPath, entry.name)))
						.sort()
				: [];
			expect(ecoFiles).toEqual([]);
			expect(existsSync(path.join(ecoDir, 'cache'))).toBe(false);

			await app.stop();
		},
	);

	it('fails the build when a content file has invalid frontmatter', { timeout: 180_000 }, async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(blogJsxDir);
		appDirs.push(appDir);
		writeFileSync(
			path.join(appDir, 'src/content/posts/invalid.mdx'),
			`---
description: Missing title
excerpt: Broken
date: 2024-01-01
image: ezi76Gu53NklsuUnsplashJpg
---

Broken post.
`,
		);

		const built = runCliBuild(appDir);
		expect(built.error).toBeUndefined();
		expect(built.status).not.toBe(0);
		expect(`${built.stdout}\n${built.stderr}`).toMatch(/title|frontmatter|schema|invalid/i);
	});
});
