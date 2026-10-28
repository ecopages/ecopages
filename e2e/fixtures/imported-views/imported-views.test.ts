import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import { loadEcoPagesConfig } from '@ecopages/core/config';
import { createViewReference } from '@ecopages/core/view-reference';
import type { ErrorPageTemplateProps } from '@ecopages/core';
import { BuildQueue } from '../../../packages/core/src/build/runtime/build-queue.ts';
import type { BuildAdapter } from '../../../packages/core/src/build/build-adapter.ts';
import { SERVER_BUNDLE_DIR } from '../../../packages/core/src/utils/resolve-entry-file.ts';
import {
	SERVER_BUNDLE_IMPLEMENTATION_FILENAME,
	runWithProductionServerBundleDir,
} from '../../../packages/core/src/utils/server-bundle-context.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from '../../../packages/core/src/build/server/server-modules-manifest.ts';
import { requireAppRuntime } from '../../../packages/core/src/utils/app-runtime.ts';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

const ORIGIN = 'http://localhost:3000';
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const fixtureDir = import.meta.dirname;

const VIEW_ROUTES = [
	{ path: '/latest', marker: 'Version 1', status: 200 },
	{ path: '/partial', marker: 'Partial 1', status: 200 },
	{ path: '/static-view', marker: 'Static 1', status: 200 },
	{ path: '/missing-imported-view', marker: 'Missing 1', status: 404 },
] as const;

const VIEW_MODULE_KEYS = [
	'src/views/latest-view.kita.tsx',
	'src/views/partial-view.kita.tsx',
	'src/views/static-view.kita.tsx',
	'src/views/not-found-view.kita.tsx',
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

function runCliBuild(appDir: string, runtime: 'bun' | 'node'): ReturnType<typeof spawnSync> {
	return spawnSync(process.execPath, [cliPath, 'build', '--runtime', runtime], {
		cwd: appDir,
		env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
		encoding: 'utf8',
		timeout: 180_000,
	});
}

async function createProductionStartApp(appConfig: Awaited<ReturnType<typeof loadEcoPagesConfig>>, appDir: string) {
	return await runWithProductionServerBundleDir(path.join(appDir, 'dist', SERVER_BUNDLE_DIR), () =>
		createApp({ appConfig }),
	);
}

function registerImportedViews(app: Awaited<ReturnType<typeof createApp>>, appDir: string): void {
	const latest = createViewReference(path.join(appDir, 'src/views/latest-view.kita.tsx'), 'kitajs');
	const partial = createViewReference(path.join(appDir, 'src/views/partial-view.kita.tsx'), 'kitajs');
	const staticView = createViewReference(path.join(appDir, 'src/views/static-view.kita.tsx'), 'kitajs');
	const notFound = createViewReference<ErrorPageTemplateProps>(
		path.join(appDir, 'src/views/not-found-view.kita.tsx'),
		'kitajs',
	);

	app.get('/latest', (ctx) => ctx.render(latest))
		.get('/partial', (ctx) => ctx.renderPartial(partial, {}))
		.static('/static-view', staticView)
		.notFound(notFound);
}

describe('imported views in production', () => {
	const appDirs: string[] = [];

	afterEach(async () => {
		vi.unstubAllEnvs();
		for (const appDir of appDirs.splice(0)) {
			rmSync(appDir, { recursive: true, force: true });
		}
	});

	it.each(['node', 'bun'] as const)(
		'serves imported views from the build without compiling (%s)',
		{ timeout: 180_000 },
		async (runtime) => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(fixtureDir);
			appDirs.push(appDir);

			const built = runCliBuild(appDir, runtime);
			expect(built.error).toBeUndefined();
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

			const manifest = JSON.parse(
				readFileSync(path.join(appDir, 'dist', SERVER_BUNDLE_DIR, SERVER_MODULES_MANIFEST_FILENAME), 'utf8'),
			) as { modules: Record<string, string> };
			expect(Object.keys(manifest.modules)).toEqual(expect.arrayContaining([...VIEW_MODULE_KEYS]));

			const serverEntry = readFileSync(
				path.join(appDir, 'dist', SERVER_BUNDLE_DIR, SERVER_BUNDLE_IMPLEMENTATION_FILENAME),
				'utf8',
			);
			expect(serverEntry).toContain('createViewReference');
			expect(serverEntry).not.toContain('Version 1');

			const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
			const app = await createProductionStartApp(appConfig, appDir);
			registerImportedViews(app, appDir);

			const runtimeState = requireAppRuntime(appConfig);
			const throwing = throwingServerBuildAdapter(runtimeState.buildAdapter);
			runtimeState.buildAdapter = throwing;
			runtimeState.buildQueue = new BuildQueue(throwing);

			for (const route of VIEW_ROUTES) {
				const response = await app.fetch(new Request(`${ORIGIN}${route.path}`));
				const body = await response.text();
				expect(response.status, `${route.path}: ${body}`).toBe(route.status);
				expect(body).toContain(route.marker);
			}

			await app.stop();
		},
	);
});
