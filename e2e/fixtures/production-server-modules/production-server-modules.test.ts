import { spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import { loadEcoPagesConfig } from '@ecopages/core/config';
import { createViewReference } from '@ecopages/core/view-reference';
import { createRecordingFileSystem, installFileSystem, nodeFs } from '../../../packages/file-system/src/index.ts';
import { BuildQueue } from '../../../packages/core/src/build/runtime/build-queue.ts';
import type { BuildAdapter } from '../../../packages/core/src/build/build-adapter.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from '../../../packages/core/src/build/server/server-modules-manifest.ts';
import { requireAppRuntime } from '../../../packages/core/src/utils/app-runtime.ts';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

const ORIGIN = 'http://localhost:3000';
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const fixtureDir = import.meta.dirname;

const PAGE_ROUTES = [
	{ path: '/', marker: 'kita-static', layout: 'kita' },
	{ path: '/kita-dynamic/alpha', marker: 'kita-dynamic', layout: 'kita' },
	{ path: '/react', marker: 'react-static', layout: 'react' },
	{ path: '/react-dynamic/alpha', marker: 'react-dynamic', layout: 'react' },
	{ path: '/lit', marker: 'lit-static', layout: 'lit' },
	{ path: '/lit-dynamic/alpha', marker: 'lit-dynamic', layout: 'lit' },
	{ path: '/jsx', marker: 'jsx-static', layout: 'jsx' },
	{ path: '/jsx-dynamic/alpha', marker: 'jsx-dynamic', layout: 'jsx' },
	{ path: '/about', marker: 'html-static' },
	{ path: '/kita-view', marker: 'kita-view', layout: 'kita' },
	{ path: '/react-view', marker: 'react-view', layout: 'react' },
	{ path: '/lit-view', marker: 'lit-view', layout: 'lit' },
	{ path: '/jsx-view', marker: 'jsx-view', layout: 'jsx' },
] as const;

const EXPECTED_SERVER_MODULE_KEYS = [
	'src/pages/index.kita.tsx',
	'src/pages/kita-dynamic/[slug].kita.tsx',
	'src/pages/react.react.tsx',
	'src/pages/react-dynamic/[slug].react.tsx',
	'src/pages/lit.lit.tsx',
	'src/pages/lit-dynamic/[slug].lit.tsx',
	'src/pages/jsx.eco.tsx',
	'src/pages/jsx-dynamic/[slug].eco.tsx',
	'src/pages/about.html',
	'src/pages/404.html',
	'src/pages/api/kita.api.ts',
	'src/pages/api/react.api.ts',
	'src/pages/api/lit.api.ts',
	'src/pages/api/jsx.api.ts',
	'src/pages/api/html.api.ts',
	'src/layouts/kita-layout.kita.tsx',
	'src/layouts/react-layout.react.tsx',
	'src/layouts/lit-layout.lit.tsx',
	'src/layouts/jsx-layout.eco.tsx',
	'src/includes/html.kita.tsx',
	'src/views/kita-view.kita.tsx',
	'src/views/react-view.react.tsx',
	'src/views/lit-view.lit.tsx',
	'src/views/jsx-view.eco.tsx',
	'src/pages/hello.script.ts',
] as const;

const ENDPOINT_ROUTES = [
	{ path: '/api/kita', integration: 'kita' },
	{ path: '/api/react', integration: 'react' },
	{ path: '/api/lit', integration: 'lit' },
	{ path: '/api/jsx', integration: 'jsx' },
	{ path: '/api/html', integration: 'html' },
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

function findPackageDir(fromDir: string, name: string): string | undefined {
	for (let dir = fromDir; ; dir = path.dirname(dir)) {
		const candidate = path.join(dir, 'node_modules', name);
		if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
		if (path.dirname(dir) === dir) return undefined;
	}
}

/**
 * Copies the fixture install and its runtime dependencies into `deployDir`,
 * so the emitted config's bare imports resolve without the workspace tree.
 *
 * @remarks
 * Workspace packages are symlinked so Node can load their TypeScript. Reads
 * through those links are still the production `node_modules` tree, so their
 * real paths are allowed roots for the recording assertion.
 */
function installProductionNodeModules(appDir: string, deployDir: string, allowedRoots: Set<string>): void {
	const destRoot = path.join(deployDir, 'node_modules');
	const linked = new Set<string>();
	const linkPackage = (name: string, sourceDir: string): void => {
		if (linked.has(name)) return;
		linked.add(name);
		const dest = path.join(destRoot, name);
		mkdirSync(path.dirname(dest), { recursive: true });
		symlinkSync(sourceDir, dest, 'dir');
		allowedRoots.add(realpathSync(sourceDir));
		const packageJson = JSON.parse(readFileSync(path.join(sourceDir, 'package.json'), 'utf8')) as {
			dependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		for (const dependency of Object.keys({
			...packageJson.dependencies,
			...packageJson.optionalDependencies,
			...packageJson.peerDependencies,
		})) {
			const dependencyDir = findPackageDir(sourceDir, dependency);
			if (dependencyDir) linkPackage(dependency, dependencyDir);
		}
	};
	const sourceRoot = path.join(appDir, 'node_modules');
	for (const entry of readdirSync(sourceRoot)) {
		if (entry.startsWith('.')) continue;
		const entryPath = path.join(sourceRoot, entry);
		if (entry.startsWith('@')) {
			for (const child of readdirSync(entryPath)) {
				linkPackage(`${entry}/${child}`, realpathSync(path.join(entryPath, child)));
			}
			continue;
		}
		linkPackage(entry, realpathSync(entryPath));
	}
}

function isInsideRoot(roots: Iterable<string>, candidate: string): boolean {
	const resolved = path.resolve(candidate);
	return [...roots].some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

async function expectEveryRouteServes(app: Awaited<ReturnType<typeof createApp>>): Promise<void> {
	for (const route of PAGE_ROUTES) {
		const response = await app.fetch(new Request(`${ORIGIN}${route.path}`));
		const body = await response.text();
		expect(response.status, `${route.path}: ${body}`).toBe(200);
		expect(body).toContain(route.marker);
		expect(body).toContain('data-html="kita"');
		if ('layout' in route) {
			expect(body).toContain(`data-layout="${route.layout}"`);
		}
	}

	expect(await (await app.fetch(new Request(`${ORIGIN}/lit`))).text()).toContain('<span>hello-ssr</span>');

	const notFound = await app.fetch(new Request(`${ORIGIN}/missing-page`));
	expect(await notFound.text()).toContain('html-404');
	expect(notFound.status).toBe(404);

	for (const route of ENDPOINT_ROUTES) {
		const response = await app.fetch(new Request(`${ORIGIN}${route.path}`));
		expect(response.status, route.path).toBe(200);
		expect(await response.json()).toEqual({ integration: route.integration });
	}
}

function registerStaticViews(app: Awaited<ReturnType<typeof createApp>>, appDir: string): void {
	app.static('/kita-view', createViewReference(path.join(appDir, 'src/views/kita-view.kita.tsx'), 'kitajs'));
	app.static('/react-view', createViewReference(path.join(appDir, 'src/views/react-view.react.tsx'), 'react'));
	app.static('/lit-view', createViewReference(path.join(appDir, 'src/views/lit-view.lit.tsx'), 'lit'));
	app.static('/jsx-view', createViewReference(path.join(appDir, 'src/views/jsx-view.eco.tsx'), 'ecopages-jsx'));
}

function runCliBuild(appDir: string): ReturnType<typeof spawnSync> {
	return spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
		cwd: appDir,
		env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
		encoding: 'utf8',
		timeout: 180_000,
	});
}

describe('production server modules', () => {
	const appDirs: string[] = [];

	afterEach(async () => {
		vi.unstubAllEnvs();
		for (const appDir of appDirs.splice(0)) {
			rmSync(appDir, { recursive: true, force: true });
		}
	});

	it('serves every route from the build output without compiling', { timeout: 180_000 }, async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(fixtureDir);
		appDirs.push(appDir);

		const built = runCliBuild(appDir);
		expect(built.error).toBeUndefined();
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

		const manifest = JSON.parse(
			readFileSync(path.join(appDir, 'dist/.server', SERVER_MODULES_MANIFEST_FILENAME), 'utf8'),
		) as { modules: Record<string, string> };
		expect(Object.keys(manifest.modules).sort()).toEqual([...EXPECTED_SERVER_MODULE_KEYS].sort());

		const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
		const app = await createApp({ appConfig });
		registerStaticViews(app, appDir);

		const runtime = requireAppRuntime(appConfig);
		const throwing = throwingServerBuildAdapter(runtime.buildAdapter);
		runtime.buildAdapter = throwing;
		runtime.buildQueue = new BuildQueue(throwing);

		await expectEveryRouteServes(app);

		await app.stop();
	});

	it(
		'serves every route from a copied dist/ and node_modules/ without reading sources',
		{ timeout: 180_000 },
		async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(fixtureDir);
			appDirs.push(appDir);

			const built = runCliBuild(appDir);
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

			const deployDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'eco-dist-deploy-')));
			appDirs.push(deployDir);
			cpSync(path.join(appDir, 'dist'), path.join(deployDir, 'dist'), { recursive: true });
			const allowedRoots = new Set<string>([deployDir, realpathSync(deployDir)]);
			installProductionNodeModules(appDir, deployDir, allowedRoots);

			const recording = createRecordingFileSystem(nodeFs);
			const restoreFileSystem = installFileSystem(recording);
			try {
				const appConfig = await loadEcoPagesConfig({
					configFile: path.join(deployDir, 'dist/.server/eco.config.mjs'),
					cwd: deployDir,
				});
				const app = await createApp({ appConfig });
				registerStaticViews(app, deployDir);

				const throwing = throwingServerBuildAdapter(requireAppRuntime(appConfig).buildAdapter);
				const runtime = requireAppRuntime(appConfig);
				runtime.buildAdapter = throwing;
				runtime.buildQueue = new BuildQueue(throwing);

				await expectEveryRouteServes(app);
				await app.stop();

				const outside = recording.recordedPaths.filter(
					(recordedPath) =>
						typeof recordedPath === 'string' &&
						recordedPath.length > 0 &&
						!isInsideRoot(allowedRoots, recordedPath),
				);
				expect(outside).toEqual([]);
			} finally {
				restoreFileSystem();
			}
		},
	);

	it('fails the build when a dynamic Page has a type error', { timeout: 180_000 }, async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(fixtureDir);
		appDirs.push(appDir);
		writeFileSync(
			path.join(appDir, 'src/pages/kita-dynamic/[slug].kita.tsx'),
			`import type { KitaLayout } from '../../layouts/kita-layout.kita';
import { eco } from '@ecopages/core';

export default eco.page({
	layout: KitaLayout,
	cache: 'dynamic',
	metadata: () => ({ title: 'Kita dynamic' }),
	render: ({ params }) => <h1>kita-dynamic {String(params.slug)}</h1>,
});
`,
		);

		const built = runCliBuild(appDir);
		expect(built.error).toBeUndefined();
		expect(built.status).not.toBe(0);
		expect(`${built.stdout}\n${built.stderr}`).toContain('kita-dynamic');
	});

	it(
		'names the source file when an emitted module is missing and does not compile',
		{ timeout: 180_000 },
		async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(fixtureDir);
			appDirs.push(appDir);

			const built = runCliBuild(appDir);
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

			const sourceKey = 'src/pages/kita-dynamic/[slug].kita.tsx';
			const serverOutdir = path.join(appDir, 'dist/.server');
			const manifest = JSON.parse(
				readFileSync(path.join(serverOutdir, SERVER_MODULES_MANIFEST_FILENAME), 'utf8'),
			) as { modules: Record<string, string> };
			const emitted = manifest.modules[sourceKey];
			expect(emitted).toBeDefined();
			unlinkSync(path.join(serverOutdir, emitted!));

			const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
			const app = await createApp({ appConfig });
			registerStaticViews(app, appDir);

			const throwing = throwingServerBuildAdapter(requireAppRuntime(appConfig).buildAdapter);
			const runtime = requireAppRuntime(appConfig);
			runtime.buildAdapter = throwing;
			runtime.buildQueue = new BuildQueue(throwing);

			await expect(
				runtime.moduleLoader.importModule({
					filePath: path.join(appDir, sourceKey),
					outdir: serverOutdir,
				}),
			).rejects.toThrow(`No compiled server module for ${sourceKey}. Run \`ecopages build\`.`);

			const response = await app.fetch(new Request(`${ORIGIN}/kita-dynamic/alpha`));
			expect(response.status).toBe(500);

			await app.stop();
		},
	);
});
