import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '@ecopages/core/create-app';
import { loadEcoPagesConfig } from '@ecopages/core/config';
import { createViewReference } from '@ecopages/core/view-reference';
import { BuildQueue } from '../../../packages/core/src/build/runtime/build-queue.ts';
import type { BuildAdapter } from '../../../packages/core/src/build/build-adapter.ts';
import { createRecordingFileSystem, installFileSystem, nodeFs } from '../../../packages/file-system/src/index.ts';
import { SERVER_MODULES_MANIFEST_FILENAME } from '../../../packages/core/src/build/server/server-modules-manifest.ts';
import { requireAppRuntime } from '../../../packages/core/src/utils/app-runtime.ts';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

const ORIGIN = 'http://localhost:3000';
const MAX_PRODUCTION_SERVER_START_ATTEMPTS = 3;
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const fixtureDir = import.meta.dirname;

const PAGE_ROUTES = [
	{ path: '/', marker: 'kita-static', layout: 'kita' },
	{ path: '/kita-dynamic/alpha', marker: 'kita-dynamic', layout: 'kita' },
	{ path: '/react', marker: 'react-static', layout: 'react' },
	{ path: '/react-dynamic/alpha', marker: 'react-dynamic', layout: 'react' },
	{ path: '/jsx', marker: 'jsx-static', layout: 'jsx' },
	{ path: '/lit', marker: 'lit-static', layout: 'lit' },
	{ path: '/lit-dynamic/alpha', marker: 'lit-dynamic', layout: 'lit' },
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
	'src/pages/radiant-production-probe.script.tsx',
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
 * Copies the fixture's runtime dependency links beside a relocated `dist/`.
 *
 * @remarks
 * Workspace packages remain symlinks so Node can load their TypeScript; their
 * real paths are included in the filesystem allowlist.
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

async function expectEveryRouteServes(
	request: (url: string) => Promise<Response>,
	origin = ORIGIN,
	diagnostics: () => string = () => '',
): Promise<void> {
	for (const route of PAGE_ROUTES) {
		const response = await request(`${origin}${route.path}`);
		const body = await response.text();
		expect(response.status, `${route.path}: ${body}\n${diagnostics()}`).toBe(200);
		expect(body).toContain(route.marker);
		expect(body).toContain('data-html="kita"');
		if ('layout' in route) {
			expect(body).toContain(`data-layout="${route.layout}"`);
		}
	}

	expect(await (await request(`${origin}/lit`)).text()).toContain('<span>hello-ssr</span>');
	const jsxBody = await (await request(`${origin}/jsx`)).text();
	expect(jsxBody).toContain('<radiant-production-probe data-radiant-ssr>');
	expect(jsxBody).toContain('data-radiant-production-probe="true"');
	expect(jsxBody).toContain('radiant-production-probe</span>');

	const notFound = await request(`${origin}/missing-page`);
	expect(await notFound.text()).toContain('html-404');
	expect(notFound.status).toBe(404);

	for (const route of ENDPOINT_ROUTES) {
		const response = await request(`${origin}${route.path}`);
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

async function listenOnPort(port = 0): Promise<{ server: ReturnType<typeof createServer>; port: number }> {
	const server = createServer();
	server.on('connection', (socket) => socket.destroy());
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Unable to read the local port for the production server test.');
	}
	return { server, port: address.port };
}

async function closeListeningServer(server: ReturnType<typeof createServer>): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

async function reservePort(): Promise<number> {
	const reservation = await listenOnPort();
	await closeListeningServer(reservation.server);
	return reservation.port;
}

function spawnProductionServer(
	appDir: string,
	port: number,
	entryFile = path.join(appDir, 'dist/server/app.mjs'),
	runtime = process.execPath,
): {
	child: ChildProcess;
	output(): string;
	closed: Promise<void>;
} {
	const child = spawn(runtime, [entryFile], {
		cwd: appDir,
		env: {
			...process.env,
			VITEST: '',
			NODE_ENV: 'production',
			ECOPAGES_HOSTNAME: '127.0.0.1',
			ECOPAGES_PORT: String(port),
			ECOPAGES_UNIFIED_PAGES_GRAPH: '0',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
	let capturedOutput = '';
	child.stdout?.on('data', (chunk: Buffer) => {
		capturedOutput += chunk.toString();
	});
	child.stderr?.on('data', (chunk: Buffer) => {
		capturedOutput += chunk.toString();
	});
	return { child, output: () => capturedOutput, closed };
}

async function waitForProductionServer(url: string, server: { child: ChildProcess; output(): string }): Promise<void> {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (server.child.exitCode !== null) {
			throw new Error(`Production server exited before listening.\n${server.output()}`);
		}
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(500) });
			if (response.status === 200) return;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Production server did not become ready.\n${server.output()}`);
}

async function startProductionServer(
	appDir: string,
	allocatePort: () => Promise<number> = reservePort,
	entryFile?: string,
	runtime?: string,
): Promise<{ child: ChildProcess; origin: string; output(): string }> {
	for (let attempt = 0; attempt < MAX_PRODUCTION_SERVER_START_ATTEMPTS; attempt += 1) {
		const port = await allocatePort();
		const server = spawnProductionServer(appDir, port, entryFile, runtime);
		const origin = `http://127.0.0.1:${port}`;
		try {
			await waitForProductionServer(origin, server);
			return { child: server.child, origin, output: server.output };
		} catch (error) {
			if (server.child.exitCode !== null || server.child.signalCode !== null) await server.closed;
			const portIsInUse = /EADDRINUSE/u.test(server.output());
			await stopProductionServer(server.child);
			if (!portIsInUse || attempt + 1 === MAX_PRODUCTION_SERVER_START_ATTEMPTS) throw error;
		}
	}
	throw new Error('Unable to start the production server after reserving local ports.');
}

async function stopProductionServer(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	const exited = waitForProcessExit(child, 5_000);
	child.kill('SIGTERM');
	if ((await exited) === null) {
		const killed = waitForProcessExit(child, 5_000);
		child.kill('SIGKILL');
		await killed;
	}
}

function clearSsrCustomElementRegistry(): void {
	const registry = (
		globalThis as typeof globalThis & {
			customElements?: CustomElementRegistry & {
				__definitions?: Map<string, { ctor: CustomElementConstructor }>;
				__reverseDefinitions?: Map<object, string>;
			};
			litLayoutModuleEvaluations?: number;
		}
	).customElements;
	registry?.__definitions?.clear();
	registry?.__reverseDefinitions?.clear();
	delete (globalThis as typeof globalThis & { litLayoutModuleEvaluations?: number }).litLayoutModuleEvaluations;
}

async function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
	if (child.exitCode !== null) return child.exitCode;
	return await new Promise<number | null>((resolve) => {
		const finish = (code: number | null): void => {
			clearTimeout(timer);
			child.off('exit', onExit);
			resolve(code);
		};
		const onExit = (code: number | null): void => finish(code);
		const timer = setTimeout(() => finish(null), timeoutMs);
		child.once('exit', onExit);
	});
}

describe('production server modules', () => {
	const appDirs: string[] = [];

	afterEach(async () => {
		vi.unstubAllEnvs();
		for (const appDir of appDirs.splice(0)) {
			rmSync(appDir, { recursive: true, force: true });
		}
		clearSsrCustomElementRegistry();
	});

	it('serves every route from the build output without compiling', { timeout: 180_000 }, async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const appDir = copyFixtureApp(fixtureDir);
		appDirs.push(appDir);

		const built = runCliBuild(appDir);
		expect(built.error).toBeUndefined();
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
		expect(existsSync(path.join(appDir, 'dist/client/index.html'))).toBe(true);
		expect(existsSync(path.join(appDir, 'dist/server/app.mjs'))).toBe(true);
		expect(existsSync(path.join(appDir, 'dist/client/server'))).toBe(false);

		const manifest = JSON.parse(
			readFileSync(path.join(appDir, 'dist/server', SERVER_MODULES_MANIFEST_FILENAME), 'utf8'),
		) as { modules: Record<string, string> };
		expect(Object.keys(manifest.modules).sort()).toEqual([...EXPECTED_SERVER_MODULE_KEYS].sort());

		const appConfig = await loadEcoPagesConfig({ configFile: path.join(appDir, 'eco.config.ts') });
		const app = await createApp({ appConfig });
		registerStaticViews(app, appDir);

		const runtime = requireAppRuntime(appConfig);
		const throwing = throwingServerBuildAdapter(runtime.buildAdapter);
		runtime.buildAdapter = throwing;
		runtime.buildQueue = new BuildQueue(throwing);

		await expectEveryRouteServes((url) => app.fetch(new Request(url)));

		await app.stop();
	});

	it(
		'serves every route from dist/ after source files are removed and rejects an incomplete deployment',
		{ timeout: 180_000 },
		async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(fixtureDir);
			appDirs.push(appDir);

			const built = runCliBuild(appDir);
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
			const wrapperPath = path.join(appDir, 'server.js');
			writeFileSync(wrapperPath, "await import('./dist/server/app.mjs');\n");

			rmSync(path.join(appDir, 'src'), { recursive: true, force: true });
			rmSync(path.join(appDir, 'eco.config.ts'), { force: true });
			const occupiedPort = await listenOnPort();
			let portAllocations = 0;
			let server: Awaited<ReturnType<typeof startProductionServer>>;
			try {
				server = await startProductionServer(
					appDir,
					async () => {
						portAllocations += 1;
						return portAllocations === 1 ? occupiedPort.port : reservePort();
					},
					wrapperPath,
				);
			} finally {
				await closeListeningServer(occupiedPort.server);
			}
			expect(portAllocations).toBe(2);
			try {
				await expectEveryRouteServes((url) => fetch(url), server.origin, server.output);
				for (const pathname of ['/server/app.mjs', '/server/server-modules.json']) {
					const response = await fetch(`${server.origin}${pathname}`);
					expect(response.status, pathname).toBe(404);
				}
			} finally {
				await stopProductionServer(server.child);
			}

			rmSync(path.join(appDir, 'dist/server/routes.json'));
			const incompleteServer = spawnProductionServer(appDir, await reservePort(), wrapperPath);
			try {
				const exitCode = await waitForProcessExit(incompleteServer.child, 15_000);
				expect(exitCode, incompleteServer.output()).not.toBeNull();
				expect(exitCode).not.toBe(0);
				expect(incompleteServer.output()).toContain('production route list');
			} finally {
				await stopProductionServer(incompleteServer.child);
			}
		},
	);

	it.skipIf(spawnSync('bun', ['--version']).status !== 0)(
		'starts the dist-only build under Bun and rejects an incomplete deployment',
		{ timeout: 180_000 },
		async () => {
			vi.stubEnv('NODE_ENV', 'production');
			const appDir = copyFixtureApp(fixtureDir);
			appDirs.push(appDir);

			const built = runCliBuild(appDir);
			expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
			rmSync(path.join(appDir, 'src'), { recursive: true, force: true });
			rmSync(path.join(appDir, 'eco.config.ts'), { force: true });
			const server = await startProductionServer(appDir, reservePort, undefined, 'bun');
			try {
				await expectEveryRouteServes((url) => fetch(url), server.origin, server.output);
			} finally {
				await stopProductionServer(server.child);
			}

			rmSync(path.join(appDir, 'dist/server/routes.json'));
			const incompleteServer = spawnProductionServer(appDir, await reservePort(), undefined, 'bun');
			try {
				const exitCode = await waitForProcessExit(incompleteServer.child, 15_000);
				expect(exitCode, incompleteServer.output()).not.toBeNull();
				expect(exitCode).not.toBe(0);
				expect(incompleteServer.output()).toContain('production route list');
			} finally {
				await stopProductionServer(incompleteServer.child);
			}
		},
	);

	it(
		'serves every route from relocated dist/ and node_modules/ without reading source files',
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
			const allowedRoots = new Set<string>([deployDir]);
			installProductionNodeModules(appDir, deployDir, allowedRoots);
			rmSync(appDir, { recursive: true, force: true });

			const recording = createRecordingFileSystem(nodeFs);
			const restoreFileSystem = installFileSystem(recording);
			try {
				const appConfig = await loadEcoPagesConfig({
					configFile: path.join(deployDir, 'dist/server/eco.config.mjs'),
					cwd: deployDir,
				});
				const app = await createApp({ appConfig });
				registerStaticViews(app, deployDir);

				const throwing = throwingServerBuildAdapter(requireAppRuntime(appConfig).buildAdapter);
				const runtime = requireAppRuntime(appConfig);
				runtime.buildAdapter = throwing;
				runtime.buildQueue = new BuildQueue(throwing);

				await expectEveryRouteServes((url) => app.fetch(new Request(url)));
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
			const serverOutdir = path.join(appDir, 'dist/server');
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
