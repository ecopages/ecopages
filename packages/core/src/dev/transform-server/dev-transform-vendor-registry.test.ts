import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import { DevTransformVendorRegistry, getVendorEntryUrl } from './dev-transform-vendor-registry.ts';
import { readVendorGraph } from './vendor-test-helpers.ts';
import { appLogger } from '../../global/app-logger.ts';

const tempRoots: string[] = [];
const repoRoot = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), '../../../../..');
const docsRoot = path.join(repoRoot, 'apps', 'docs');

function createTempRoot(prefix: string): string {
	const root = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

/**
 * Writes the vendor files that `urls` load to a directory and imports each URL there.
 *
 * @remarks
 * Node evaluates them as the browser would: one module per file, linked by their imports, whose absolute vendor
 * URLs it reads as files of the same folder.
 */
async function importVendorGraph(registry: DevTransformVendorRegistry, urls: string[]): Promise<unknown[]> {
	const directory = path.fromNative(fs.realpathSync(createTempRoot('dev-transform-vendor-eval')));
	for (const [url, code] of await readVendorGraph(registry, urls)) {
		const file = path.join(directory, url.slice('/'.length));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, code.replaceAll(/(["'])\/assets\/vendors\//gu, '$1./'));
	}
	const modules: unknown[] = [];
	for (const url of urls) {
		modules.push(await import(/* @vite-ignore */ path.toFileUrl(path.join(directory, url.slice('/'.length))).href));
	}
	return modules;
}

/**
 * Counts `bundle()` calls for entries under `rootDir`.
 *
 * @remarks
 * The prototype spy sees the builds of every registry in this file.
 */
function bundleCallsUnder(bundle: { mock: { calls: unknown[][] } }, rootDir: string): number {
	return bundleEntriesUnder(bundle, rootDir).length;
}

/** The entry files of each `bundle()` call for entries under `rootDir`. */
function bundleEntriesUnder(bundle: { mock: { calls: unknown[][] } }, rootDir: string): string[][] {
	const realRoot = path.fromNative(fs.realpathSync(rootDir));
	return bundle.mock.calls
		.map(([options]) => Object.values((options as { entrypoints: Record<string, string> }).entrypoints))
		.filter((entries) => entries.some((entry) => entry.startsWith(realRoot)))
		.map((entries) => entries.filter((entry) => entry.startsWith(realRoot)));
}

/**
 * Time allowed to a test that builds `@ecopages/core`, whose package file holds its whole browser surface and checks
 * each subpath of it before the file is built, so a machine that runs other work takes seconds.
 */
const VENDOR_CORE_BUILD_TIMEOUT_MS = 30_000;

describe('DevTransformVendorRegistry', () => {
	it('resolves @ecopages/core to the browser package entry', () => {
		const resolved = resolveBarePackageBrowserEntry(docsRoot, '@ecopages/core');
		assert.ok(resolved);
		expect(resolved.path).toMatch(/index\.browser\.ts$/);
	});

	it(
		'prebundles @ecopages/core without Node builtins',
		async () => {
			const rootDir = createTempRoot('dev-transform-vendor-core-browser');
			fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
			fs.writeFileSync(
				path.join(rootDir, 'package.json'),
				JSON.stringify(
					{
						name: 'dev-transform-vendor-fixture',
						type: 'module',
						dependencies: {
							'@ecopages/core': `file:${path.join(repoRoot, 'packages', 'core')}`,
						},
					},
					null,
					2,
				),
				'utf8',
			);
			fs.mkdirSync(path.join(rootDir, 'node_modules', '@ecopages'), { recursive: true });
			fs.symlinkSync(
				path.join(repoRoot, 'packages', 'core'),
				path.join(rootDir, 'node_modules', '@ecopages', 'core'),
				'dir',
			);

			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const registry = new DevTransformVendorRegistry({
				appConfig: config,
			});

			const url = await registry.resolveVendorUrl('@ecopages/core');
			expect(url).toMatch(/^\/assets\/vendors\/bf-.+\.js$/);
			expect(fs.existsSync(path.join(config.absolutePaths.distDir, url.slice('/'.length)))).toBe(false);

			const response = await registry.tryHandleVendorRequest(url);
			assert.ok(response);
			const code = await response.text();
			expect(code).not.toMatch(/node:(?:fs|path|async_hooks|crypto)/);
			expect(code).toMatch(/eco/);
		},
		VENDOR_CORE_BUILD_TIMEOUT_MS,
	);

	it(
		"points a package's @ecopages/core imports at core's browser-first entry",
		async () => {
			const rootDir = path.fromNative(fs.realpathSync(createTempRoot('dev-transform-vendor-core-import')));
			fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
			const modules = path.join(rootDir, 'node_modules');
			fs.mkdirSync(path.join(modules, '@ecopages'), { recursive: true });
			fs.symlinkSync(path.join(repoRoot, 'packages', 'core'), path.join(modules, '@ecopages', 'core'), 'dir');
			fs.mkdirSync(path.join(modules, 'router-lib'));
			fs.writeFileSync(
				path.join(modules, 'router-lib', 'package.json'),
				JSON.stringify({ name: 'router-lib', type: 'module', exports: './index.js' }),
			);
			fs.writeFileSync(
				path.join(modules, 'router-lib', 'index.js'),
				"import { ECO_PERSIST_ATTRIBUTE } from '@ecopages/core/client';\nexport const attribute = ECO_PERSIST_ATTRIBUTE;\n",
			);
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const registry = new DevTransformVendorRegistry({ appConfig: config });

			const routerUrl = await registry.resolveVendorUrl('router-lib');
			const coreClientUrl = await registry.resolveVendorUrl('@ecopages/core/client');

			const routerCode = [...(await readVendorGraph(registry, [routerUrl]))]
				.filter(([url]) => url.includes('router-lib'))
				.map(([, code]) => code)
				.join('\n');
			expect(routerCode).toContain(`from "${coreClientUrl}"`);
			expect(routerCode).not.toContain('packages/core/src');
		},
		VENDOR_CORE_BUILD_TIMEOUT_MS,
	);

	it('builds the entries a contributor declares up front with the first requested one', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-known-entries');
		const contributorDir = path.join(rootDir, 'packages', 'contributor');
		for (const name of ['known-a', 'known-b']) {
			writePackage(
				path.join(contributorDir, 'node_modules', name),
				name,
				{ type: 'module', exports: './index.js' },
				{ 'index.js': `export const name = '${name}';\n` },
			);
		}
		expect(fs.existsSync(path.join(modules, 'known-a'))).toBe(false);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		const generatedModule = path.join(contributorDir, 'src', 'bootstrap.js');

		registry.addKnownEntries({
			resolveFrom: path.join(contributorDir, 'src'),
			specifiers: ['known-a', 'known-b', 'not-installed'],
		});
		await registry.resolveVendorUrl('known-a', generatedModule);
		await registry.resolveVendorUrl('known-b', generatedModule);

		expect(bundleEntriesUnder(bundle, rootDir)).toEqual([
			[expect.stringContaining('known-a')],
			[expect.stringContaining('known-b')],
		]);
	});

	it('moves each importer of a shared entry to the file it reaches after an invalidation', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-invalidate-sources');
		const hostModules = path.join(rootDir, 'packages', 'host', 'node_modules');
		const store = path.join(modules, '.pnpm');
		for (const version of ['1.0.0', '2.0.0']) {
			writePackage(
				path.join(store, `shared-lib@${version}`, 'node_modules', 'shared-lib'),
				'shared-lib',
				{ type: 'module', module: 'index.js', version },
				{ 'index.js': `export const marker = 'shared-${version}';\n` },
			);
		}
		const linkTo = (modulesDir: string, version: string) => {
			fs.mkdirSync(modulesDir, { recursive: true });
			fs.rmSync(path.join(modulesDir, 'shared-lib'), { force: true });
			fs.symlinkSync(
				path.join(store, `shared-lib@${version}`, 'node_modules', 'shared-lib'),
				path.join(modulesDir, 'shared-lib'),
				'dir',
			);
		};
		linkTo(modules, '1.0.0');
		linkTo(hostModules, '1.0.0');
		fs.mkdirSync(path.join(rootDir, 'packages', 'host', 'src'), { recursive: true });
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const appUrl = await registry.resolveVendorUrl('shared-lib');
		expect(
			await registry.resolveVendorUrl('shared-lib', path.join(rootDir, 'packages', 'host', 'src', 'index.js')),
		).toBe(appUrl);

		linkTo(hostModules, '2.0.0');
		registry.invalidateAll();
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		await registry.tryHandleVendorRequest(appUrl);

		expect(bundleEntriesUnder(bundle, rootDir)).toEqual([
			[expect.stringContaining('shared-lib@1.0.0')],
			[expect.stringContaining('shared-lib@2.0.0')],
		]);
	});

	it('reports an actionable error when a bare import resolves to a server-only entry', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-server-only');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify(
				{
					name: 'dev-transform-vendor-server-only-fixture',
					type: 'module',
					dependencies: {
						'@ecopages/react': `file:${path.join(repoRoot, 'packages', 'integrations', 'react')}`,
					},
				},
				null,
				2,
			),
			'utf8',
		);
		fs.mkdirSync(path.join(rootDir, 'node_modules', '@ecopages'), { recursive: true });
		fs.symlinkSync(
			path.join(repoRoot, 'packages', 'integrations', 'react'),
			path.join(rootDir, 'node_modules', '@ecopages', 'react'),
			'dir',
		);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
		});

		await expect(registry.resolveVendorUrl('@ecopages/react')).rejects.toThrow('resolved to a server-only entry');
	});

	it(
		'serves a cached vendor bundle from memory without a disk output',
		async () => {
			const rootDir = createTempRoot('dev-transform-vendor-stale-output');
			fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
			fs.writeFileSync(
				path.join(rootDir, 'package.json'),
				JSON.stringify(
					{
						name: 'dev-transform-vendor-stale-output',
						type: 'module',
						dependencies: { '@ecopages/core': `file:${path.join(repoRoot, 'packages', 'core')}` },
					},
					null,
					2,
				),
				'utf8',
			);
			fs.mkdirSync(path.join(rootDir, 'node_modules', '@ecopages'), { recursive: true });
			fs.symlinkSync(
				path.join(repoRoot, 'packages', 'core'),
				path.join(rootDir, 'node_modules', '@ecopages', 'core'),
				'dir',
			);

			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const registry = new DevTransformVendorRegistry({
				appConfig: config,
			});

			const url = await registry.resolveVendorUrl('@ecopages/core');
			const outputPath = path.join(config.absolutePaths.distDir, url.slice('/'.length));
			expect(fs.existsSync(outputPath)).toBe(false);
			const response = await registry.tryHandleVendorRequest(url);
			assert.ok(response);
			expect(await response.text()).toContain('eco');
		},
		VENDOR_CORE_BUILD_TIMEOUT_MS,
	);

	async function createFixtureLibRegistry() {
		const rootDir = createTempRoot('dev-transform-vendor-concurrency');
		lastFixtureRoot = rootDir;
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'dev-transform-vendor-concurrency', type: 'module' }),
			'utf8',
		);
		const packageDir = path.join(rootDir, 'node_modules', 'fixture-lib');
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: 'fixture-lib', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(packageDir, 'index.js'), "export const release = 'one';\n");

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		return new DevTransformVendorRegistry({ appConfig: config });
	}

	let lastFixtureRoot = '';

	it('builds a vendor bundle once for concurrent requests', async () => {
		const registry = await createFixtureLibRegistry();
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');

		const urls = await Promise.all([
			registry.resolveVendorUrl('fixture-lib'),
			registry.resolveVendorUrl('fixture-lib'),
			registry.resolveVendorUrl('fixture-lib'),
		]);

		expect(new Set(urls).size).toBe(1);
		expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(1);
		await registry.resolveVendorUrl('fixture-lib');
		expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(1);
	});

	it('does not cache a build that finished after the registry was invalidated', async () => {
		const registry = await createFixtureLibRegistry();
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');

		const stale = registry.resolveVendorUrl('fixture-lib');
		await vi.waitFor(() => expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(1));
		registry.invalidateAll();
		const url = await stale;

		expect(await registry.tryHandleVendorRequest(url)).not.toBeNull();
		expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(2);
		await registry.resolveVendorUrl('fixture-lib');
		expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(2);
	});

	it.each([
		{ install: 'plain', importName: 'fixture-lib', manifestName: 'fixture-lib' },
		{
			install: 'aliased (npm:fixture-lib) with a nested manifest',
			importName: 'my-lib',
			manifestName: 'fixture-lib',
		},
	])('builds an updated package version in the new process ($install)', async (fixture) => {
		const rootDir = createTempRoot('dev-transform-vendor-upgrade');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'dev-transform-vendor-upgrade', type: 'module' }),
			'utf8',
		);
		const packageDir = path.join(rootDir, 'node_modules', fixture.importName);
		fs.mkdirSync(path.join(packageDir, 'esm'), { recursive: true });
		fs.writeFileSync(path.join(packageDir, 'esm', 'package.json'), JSON.stringify({ type: 'module' }));
		const installVersion = (version: string) => {
			fs.writeFileSync(
				path.join(packageDir, 'package.json'),
				JSON.stringify({ name: fixture.manifestName, version, type: 'module', module: 'esm/index.js' }),
			);
			fs.writeFileSync(path.join(packageDir, 'esm', 'index.js'), "export { release } from './lib.js';\n");
			fs.writeFileSync(path.join(packageDir, 'esm', 'lib.js'), `export const release = 'release-${version}';\n`);
		};

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const createRegistry = () => new DevTransformVendorRegistry({ appConfig: config });

		installVersion('1.0.0');
		const oldUrl = await createRegistry().resolveVendorUrl(fixture.importName);

		installVersion('1.0.1');
		const restarted = createRegistry();
		const newUrl = await restarted.resolveVendorUrl(fixture.importName);

		expect(newUrl).toBe(oldUrl);
		expect([...(await readVendorGraph(restarted, [newUrl])).values()].join('\n')).toContain('release-1.0.1');
	});

	it('rebuilds when a transitive dependency changes between dev processes', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-transitive');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'dev-transform-vendor-transitive', type: 'module' }),
			'utf8',
		);
		const packageDir = path.join(rootDir, 'node_modules', 'fixture-lib');
		const dependencyDir = path.join(rootDir, 'node_modules', 'fixture-dep');
		fs.mkdirSync(packageDir, { recursive: true });
		fs.mkdirSync(dependencyDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: 'fixture-lib', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(packageDir, 'index.js'), "export { release } from 'fixture-dep';\n");
		fs.writeFileSync(
			path.join(dependencyDir, 'package.json'),
			JSON.stringify({ name: 'fixture-dep', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		const writeDependency = (release: number) =>
			fs.writeFileSync(path.join(dependencyDir, 'index.js'), `export const release = ${release};\n`);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const createRegistry = () => new DevTransformVendorRegistry({ appConfig: config });
		const readDependency = async (registry: DevTransformVendorRegistry, url: string) =>
			[...(await readVendorGraph(registry, [url])).values()].join('\n');

		writeDependency(1);
		const firstProcess = createRegistry();
		const url = await firstProcess.resolveVendorUrl('fixture-lib');
		expect(await readDependency(firstProcess, url)).toContain('release = 1');

		writeDependency(2);
		const restarted = createRegistry();
		const restartedUrl = await restarted.resolveVendorUrl('fixture-lib');
		expect(restartedUrl).toBe(url);
		expect(await readDependency(restarted, restartedUrl)).toContain('release = 2');
		expect(fs.existsSync(path.join(config.absolutePaths.distDir, url.slice('/'.length)))).toBe(false);
	});

	it('rebundles a workspace-linked package when a non-entry file changes', async () => {
		const workspaceRoot = createTempRoot('dev-transform-vendor-workspace');
		const rootDir = path.join(workspaceRoot, 'app');
		const packageDir = path.join(workspaceRoot, 'packages', 'ui');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
		fs.mkdirSync(path.join(packageDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: '@acme/ui', version: '1.0.0', type: 'module', module: 'src/index.ts' }),
		);
		fs.writeFileSync(
			path.join(packageDir, 'src', 'index.ts'),
			"export { label } from './button.ts';\nexport { dep } from 'ui-dep';\n",
		);
		const depDir = path.join(packageDir, 'node_modules', 'ui-dep');
		fs.mkdirSync(depDir, { recursive: true });
		fs.writeFileSync(
			path.join(depDir, 'package.json'),
			JSON.stringify({ name: 'ui-dep', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(depDir, 'index.js'), "export const dep = 'ui-dep-code';\n");
		fs.mkdirSync(path.join(rootDir, 'node_modules', '@acme'), { recursive: true });
		fs.symlinkSync(packageDir, path.join(rootDir, 'node_modules', '@acme', 'ui'), 'dir');
		const writeButton = (label: string) =>
			fs.writeFileSync(path.join(packageDir, 'src', 'button.ts'), `export const label: string = '${label}';\n`);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const createRegistry = () => new DevTransformVendorRegistry({ appConfig: config });
		const readServed = async (registry: DevTransformVendorRegistry, url: string) =>
			[...(await readVendorGraph(registry, [url])).values()].join('\n');

		writeButton('button-v1');
		const running = createRegistry();
		const oldUrl = await running.resolveVendorUrl('@acme/ui');
		expect(await readServed(running, oldUrl)).toContain('button-v1');

		writeButton('button-v2');
		running.invalidateAll();
		const rebuiltUrl = await running.resolveVendorUrl('@acme/ui');
		expect(rebuiltUrl).toBe(oldUrl);
		expect(await readServed(running, rebuiltUrl)).toContain('button-v2');

		writeButton('button-v3');
		const restarted = createRegistry();
		const restartedUrl = await restarted.resolveVendorUrl('@acme/ui');
		expect(restartedUrl).toMatch(/^\/assets\/vendors\/mf-.+\.js$/);
		expect(restartedUrl).toBe(oldUrl);
		const restartedCode = await readServed(restarted, restartedUrl);
		expect(restartedCode).toContain('button-v3');
		expect([...(await readVendorGraph(restarted, [restartedUrl])).values()].join('\n')).toContain('ui-dep-code');
	});

	it('serves vendor bundles for revalidation instead of as immutable', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-revalidate');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'dev-transform-vendor-revalidate', type: 'module' }),
			'utf8',
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(path.join(rootDir, 'node_modules', 'fixture-lib'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'node_modules', 'fixture-lib', 'package.json'),
			JSON.stringify({ name: 'fixture-lib', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(rootDir, 'node_modules', 'fixture-lib', 'index.js'), 'export const release = 1;');
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('fixture-lib');
		const [codeUrl] =
			[...(await readVendorGraph(registry, [url]))].find(([, code]) => code.includes('release = 1')) ?? [];
		assert.ok(codeUrl);

		const response = await registry.tryHandleVendorRequest(codeUrl);
		assert.ok(response);
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		const etag = response.headers.get('ETag');
		assert.ok(etag);

		const revalidated = await registry.tryHandleVendorRequest(codeUrl, etag);
		expect(revalidated?.status).toBe(304);
		for (const ifNoneMatch of [`"other", W/${etag}`, ` ${etag} `, '*']) {
			expect((await registry.tryHandleVendorRequest(codeUrl, ifNoneMatch))?.status).toBe(304);
		}
		expect((await registry.tryHandleVendorRequest(codeUrl, '"other"'))?.status).toBe(200);

		fs.writeFileSync(path.join(rootDir, 'node_modules', 'fixture-lib', 'index.js'), 'export const release = 22;');
		registry.invalidateAll();
		await registry.resolveVendorUrl('fixture-lib');
		const changed = await registry.tryHandleVendorRequest(codeUrl, etag);
		expect(changed?.status).toBe(200);
		expect(await changed?.text()).toContain('release = 22');
	});

	function writePackage(dir: string, name: string, manifest: Record<string, unknown>, files: Record<string, string>) {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }));
		for (const [file, contents] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), contents);
	}

	function createAppRoot(prefix: string) {
		const rootDir = createTempRoot(prefix);
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
		return { rootDir, modules: path.join(rootDir, 'node_modules') };
	}

	it('loads a module shared by a package root and its subpath from one vendor file', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-identity');
		writePackage(
			path.join(modules, 'identity-lib'),
			'identity-lib',
			{ type: 'module', exports: { '.': './index.js', './hooks': './hooks.js' } },
			{
				'shared.js': "export const context = { marker: 'identity-shared-code' };\n",
				'index.js': "import { context } from './shared.js';\nexport const providerContext = context;\n",
				'hooks.js': "import { context } from './shared.js';\nexport const hookContext = context;\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const urls = await Promise.all([
			registry.resolveVendorUrl('identity-lib'),
			registry.resolveVendorUrl('identity-lib/hooks'),
		]);

		const files = await readVendorGraph(registry, urls);
		expect([...files.values()].filter((code) => code.includes('identity-shared-code'))).toHaveLength(1);
		const [root, hooks] = (await importVendorGraph(registry, urls)) as [
			{ providerContext: unknown },
			{ hookContext: unknown },
		];
		expect(root.providerContext).toBe(hooks.hookContext);
	});

	it('evaluates a CommonJS module required by two packages once', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-require');
		writePackage(
			path.join(modules, 'cjs-dep'),
			'cjs-dep',
			{ main: 'index.js' },
			{
				'index.js':
					"globalThis.__cjsDepEvaluations = (globalThis.__cjsDepEvaluations ?? 0) + 1;\nmodule.exports = { marker: 'cjs-dep-code' };\n",
			},
		);
		for (const name of ['cjs-a', 'cjs-b']) {
			writePackage(
				path.join(modules, name),
				name,
				{ main: 'index.js' },
				{ 'index.js': "module.exports = { dep: require('cjs-dep') };\n" },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const urls = await Promise.all([registry.resolveVendorUrl('cjs-a'), registry.resolveVendorUrl('cjs-b')]);

		const files = await readVendorGraph(registry, urls);
		expect([...files.values()].filter((code) => code.includes('cjs-dep-code'))).toHaveLength(1);
		const globals = globalThis as { __cjsDepEvaluations?: number };
		globals.__cjsDepEvaluations = 0;
		const [a, b] = (await importVendorGraph(registry, urls)) as { default: { dep: unknown } }[];
		expect(globals.__cjsDepEvaluations).toBe(1);
		expect(a.default.dep).toBe(b.default.dep);
		delete globals.__cjsDepEvaluations;
	});

	it('reports whether the module of a vendor entry is CommonJS', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-format');
		writePackage(
			path.join(modules, 'cjs-lib'),
			'cjs-lib',
			{ main: 'index.js' },
			{ 'index.js': 'exports.answer = 42;\n' },
		);
		writePackage(
			path.join(modules, 'esm-lib'),
			'esm-lib',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': 'export const answer = 42;\n' },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const [cjs, esm] = await Promise.all([
			registry.resolveVendorImport('cjs-lib', path.join(config.absolutePaths.srcDir, 'page.js')),
			registry.resolveVendorImport('esm-lib', path.join(config.absolutePaths.srcDir, 'page.js')),
		]);

		expect(cjs.commonJs).toBe(true);
		expect(esm.commonJs).toBe(false);
		const [cjsModule] = (await importVendorGraph(registry, [cjs.url])) as Record<string, unknown>[];
		expect(cjsModule.default).toEqual({ answer: 42 });
		expect(cjsModule).not.toHaveProperty('answer');
	});

	it('keeps a served CommonJS entry unchanged when a later package needs another runtime helper', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-runtime-pin');
		writePackage(
			path.join(modules, 'cjs-lib'),
			'cjs-lib',
			{ main: 'index.js' },
			{ 'index.js': 'exports.answer = 42;\n' },
		);
		writePackage(
			path.join(modules, 'namespace-lib'),
			'namespace-lib',
			{ type: 'module', exports: './index.js' },
			{
				'index.js': "import * as parts from './parts.js';\nexport const names = () => Object.keys(parts);\n",
				'parts.js': 'export const a = 1;\nexport const b = 2;\n',
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const cjsUrl = await registry.resolveVendorUrl('cjs-lib');
		const served = await readVendorGraph(registry, [cjsUrl]);

		await registry.resolveVendorUrl('namespace-lib');

		expect(await readVendorGraph(registry, [cjsUrl])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
	});

	it('keeps a served CommonJS entry unchanged when a later package imports it', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-cjs-importer');
		writePackage(
			path.join(modules, 'cjs-lib'),
			'cjs-lib',
			{ main: 'index.js' },
			{ 'index.js': 'exports.answer = 42;\n' },
		);
		writePackage(
			path.join(modules, 'cjs-importer'),
			'cjs-importer',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "import cjs from 'cjs-lib';\nexport const answer = cjs.answer;\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const cjsUrl = await registry.resolveVendorUrl('cjs-lib');
		const served = await readVendorGraph(registry, [cjsUrl]);

		const importerUrl = await registry.resolveVendorUrl('cjs-importer');

		expect(await readVendorGraph(registry, [cjsUrl])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
		const [importer] = (await importVendorGraph(registry, [importerUrl])) as { answer: number }[];
		expect(importer?.answer).toBe(42);
	});

	it('keeps every file a browser loaded as it was when a later package shares a dependency with it', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-served-carry');
		writePackage(
			path.join(modules, 'shared-dep'),
			'shared-dep',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "export const shared = 'shared-dep';\n" },
		);
		for (const name of ['lib-a', 'lib-c']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', exports: './index.js' },
				{ 'index.js': `import { shared } from 'shared-dep';\nexport const name = '${name}' + shared;\n` },
			);
		}
		writePackage(
			path.join(modules, 'lib-b'),
			'lib-b',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "export const name = 'lib-b';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const libA = await registry.resolveVendorUrl('lib-a');
		const served = await readVendorGraph(registry, [libA]);
		await registry.resolveVendorUrl('lib-b');

		await registry.resolveVendorUrl('lib-c');

		expect(await readVendorGraph(registry, [libA])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
	});

	it('keeps the file of a module as it was when a later package reads its namespace object as a value', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-namespace');
		writePackage(
			path.join(modules, 'ns-lib'),
			'ns-lib',
			{ type: 'module', exports: { '.': './index.js', './dep': './dep.js' } },
			{
				'index.js': "import { a } from './dep.js';\nexport const first = 'first-' + a;\n",
				'dep.js': "export const a = 'a';\nexport const b = 'b';\n",
			},
		);
		writePackage(
			path.join(modules, 'ns-user'),
			'ns-user',
			{ type: 'module', exports: './index.js' },
			{
				'index.js':
					"import * as dep from 'ns-lib/dep';\nexport const keys = Object.keys(dep);\nexport { dep };\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const libUrl = await registry.resolveVendorUrl('ns-lib');
		const served = await readVendorGraph(registry, [libUrl]);

		const userUrl = await registry.resolveVendorUrl('ns-user');

		expect(await readVendorGraph(registry, [libUrl])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
		const [, user] = (await importVendorGraph(registry, [libUrl, userUrl])) as [unknown, { keys: string[] }];
		expect(user.keys).toEqual(['a', 'b']);
	});

	it('does not run a CommonJS module that a package reaches by both require() and a dynamic import()', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-mixed-require');
		writePackage(
			path.join(modules, 'mixed-lib'),
			'mixed-lib',
			{ main: 'index.cjs' },
			{
				'index.cjs':
					"exports.sync = () => require('./target.cjs');\nexports.async = () => import('./target.cjs');\n",
				'target.cjs':
					'globalThis.__mixedTargetRuns = (globalThis.__mixedTargetRuns ?? 0) + 1;\nmodule.exports = { value: 7 };\n',
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('mixed-lib');
		const runs = globalThis as { __mixedTargetRuns?: number };
		delete runs.__mixedTargetRuns;

		const [lib] = (await importVendorGraph(registry, [url])) as [
			{ default: { sync: () => { value: number }; async: () => Promise<{ default: { value: number } }> } },
		];

		expect(runs.__mixedTargetRuns).toBeUndefined();
		expect(lib.default.sync().value).toBe(7);
		expect((await lib.default.async()).default.value).toBe(7);
		expect(runs.__mixedTargetRuns).toBe(1);
		delete runs.__mixedTargetRuns;
	});

	it('keeps the files of a package that has internal modules as they were when a package in another folder is added', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-folders');
		writePackage(
			path.join(modules, 'inner-lib'),
			'inner-lib',
			{ type: 'module', exports: './index.js' },
			{
				'index.js': "import { helper } from './helper.js';\nexport const name = 'inner-lib' + helper;\n",
				'helper.js': "export const helper = '-helper';\n",
			},
		);
		writePackage(
			path.join(modules, 'sibling-lib'),
			'sibling-lib',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "export const name = 'sibling-lib';\n" },
		);
		const linked = path.join(path.dirname(rootDir), `${path.basename(rootDir)}-linked-lib`);
		writePackage(
			linked,
			'linked-lib',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "export const name = 'linked-lib';\n" },
		);
		fs.symlinkSync(linked, path.join(modules, 'linked-lib'), 'dir');
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const innerUrl = await registry.resolveVendorUrl('inner-lib');
		const served = await readVendorGraph(registry, [innerUrl]);
		expect(served.size).toBeGreaterThan(1);

		await registry.resolveVendorUrl('sibling-lib');
		await registry.resolveVendorUrl('linked-lib');

		expect(await readVendorGraph(registry, [innerUrl])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
	});

	it('keeps the files that import a module as they were when that module becomes an entry', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-promoted');
		writePackage(
			path.join(modules, 'outer-lib'),
			'outer-lib',
			{ type: 'module', exports: { '.': './index.js', './dep': './dep.js' } },
			{
				'index.js': "import { dep } from './dep.js';\nexport const outer = 'outer' + dep;\n",
				'dep.js': "export const dep = '-dep';\nexport default 'dep-default';\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const outerUrl = await registry.resolveVendorUrl('outer-lib');
		const served = await readVendorGraph(registry, [outerUrl]);

		const depUrl = await registry.resolveVendorUrl('outer-lib/dep');

		expect(await readVendorGraph(registry, [outerUrl])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
		const [outer, dep] = (await importVendorGraph(registry, [outerUrl, depUrl])) as [
			{ outer: string },
			{ dep: string; default: string },
		];
		expect(outer.outer).toBe('outer-dep');
		expect(dep.default).toBe('dep-default');
	});

	it('serves and imports a package whose path holds a quote, a space and a non-ASCII character', async () => {
		const rootDir = path.join(createTempRoot('dev-transform-vendor-odd-path'), "O'Neil cafe\u0301 #1 100%");
		fs.mkdirSync(rootDir, { recursive: true });
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
		writePackage(
			path.join(rootDir, 'node_modules', 'odd-lib'),
			'odd-lib',
			{ type: 'module', exports: './index.js' },
			{
				'index.js': "import { inner } from './inner.js';\nexport const odd = 'odd-' + inner;\n",
				'inner.js': "export const inner = 'value';\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('odd-lib');

		const files = await readVendorGraph(registry, [url]);

		for (const file of files.keys()) expect(file).toMatch(/^\/assets\/vendors\/[A-Za-z0-9._@=,+~-]+$/u);
		const [lib] = (await importVendorGraph(registry, [url])) as [{ odd: string }];
		expect(lib.odd).toBe('odd-value');
	});

	it('gives modules whose paths differ only by a separator or an extension their own files', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-name-collisions');
		writePackage(
			path.join(modules, 'twins-lib'),
			'twins-lib',
			{
				type: 'module',
				exports: {
					'.': './index.js',
					'./dashed': './a-b.js',
					'./nested': './a/b.js',
					'./module': './index.mjs',
				},
			},
			{
				'index.js': "export const name = 'index-js';\n",
				'index.mjs': "export const name = 'index-mjs';\n",
				'a-b.js': "export const name = 'a-b';\n",
			},
		);
		fs.mkdirSync(path.join(modules, 'twins-lib', 'a'));
		fs.writeFileSync(path.join(modules, 'twins-lib', 'a', 'b.js'), "export const name = 'a/b';\n");
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const urls = await Promise.all(
			['twins-lib', 'twins-lib/dashed', 'twins-lib/nested', 'twins-lib/module'].map((specifier) =>
				registry.resolveVendorUrl(specifier),
			),
		);

		expect(new Set(urls).size).toBe(4);
		const modulesByUrl = (await importVendorGraph(registry, urls)) as { name: string }[];
		expect(modulesByUrl.map((module) => module.name)).toEqual(['index-js', 'a-b', 'a/b', 'index-mjs']);
	});

	it('does not run a CommonJS module that a package requires only when a function runs', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-lazy-require');
		writePackage(
			path.join(modules, 'lazy-lib'),
			'lazy-lib',
			{ main: 'index.cjs' },
			{
				'index.cjs':
					"exports.load = () => require('./later.cjs');\nexports.loadAccented = () => require('./caf\u00e9.cjs');\nexports.loadDynamic = () => import('./dynamic.cjs');\nexports.optional = () => { try { return require('./missing-at-runtime.cjs'); } catch { return 'absent'; } };\n",
				'later.cjs': "throw new Error('later.cjs ran on import');\n",
				'caf\u00e9.cjs': "throw new Error('accented module ran on import');\n",
				'dynamic.cjs': 'module.exports = { value: 42 };\n',
				'missing-at-runtime.cjs': "throw new Error('optional module is not installed');\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('lazy-lib');

		const [lib] = (await importVendorGraph(registry, [url])) as [
			{
				default: {
					optional: () => string;
					load: () => unknown;
					loadAccented: () => unknown;
					loadDynamic: () => Promise<{ default: { value: number } }>;
				};
			},
		];

		expect(lib.default.optional()).toBe('absent');
		expect(() => lib.default.load()).toThrow('later.cjs ran on import');
		expect(() => lib.default.loadAccented()).toThrow('accented module ran on import');
		expect((await lib.default.loadDynamic()).default.value).toBe(42);
	});

	it('loads a package that two packages import as one module', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-shared');
		writePackage(
			path.join(modules, 'shared-core'),
			'shared-core',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const registry = new Map(); export const marker = 'shared-core-code';\n" },
		);
		for (const name of ['plugin-a', 'plugin-b']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{ 'index.js': "export { registry } from 'shared-core';\n" },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const urls = await Promise.all(
			['plugin-a', 'plugin-b', 'shared-core'].map((specifier) => registry.resolveVendorUrl(specifier)),
		);

		const files = await readVendorGraph(registry, urls);
		expect([...files.values()].filter((code) => code.includes('shared-core-code'))).toHaveLength(1);
		const [pluginA, pluginB, sharedCore] = (await importVendorGraph(registry, urls)) as { registry: unknown }[];
		expect(pluginA.registry).toBe(sharedCore.registry);
		expect(pluginB.registry).toBe(sharedCore.registry);
	});

	it('does not report a vendor graph change when a package that shares code with a loaded one is added', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-graph-change');
		writePackage(
			path.join(modules, 'shared-core'),
			'shared-core',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'shared-core-code';\n" },
		);
		for (const name of ['plugin-a', 'plugin-b']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{ 'index.js': `export { marker } from 'shared-core';\nexport const name = '${name}';\n` },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });

		const pluginA = await registry.resolveVendorUrl('plugin-a');
		const served = await readVendorGraph(registry, [pluginA]);
		const pluginB = await registry.resolveVendorUrl('plugin-b');

		expect(await readVendorGraph(registry, [pluginA])).toEqual(served);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
		const [a, b] = (await importVendorGraph(registry, [pluginA, pluginB])) as { marker: string }[];
		expect(a?.marker).toBe(b?.marker);
	});

	it('serves a package as one file with a small file for each subpath that re-exports from it', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-package-file');
		writePackage(
			path.join(modules, 'multi-lib'),
			'multi-lib',
			{ type: 'module', exports: { '.': './index.js', './alpha': './alpha.js', './beta': './beta.js' } },
			{
				'shared.js': 'export const state = { count: 0 };\n',
				'index.js': "export { state } from './shared.js';\nexport const root = 'root';\n",
				'alpha.js':
					"import { state } from './shared.js';\nexport const alpha = () => ++state.count;\nexport default 'alpha-default';\n",
				'beta.js': "import { state } from './shared.js';\nexport const beta = () => ++state.count;\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const alphaUrl = await registry.resolveVendorUrl('multi-lib/alpha');

		const files = await readVendorGraph(registry, [alphaUrl]);

		expect(files.size).toBe(2);
		const betaUrl = await registry.resolveVendorUrl('multi-lib/beta');
		const [alpha, beta] = (await importVendorGraph(registry, [alphaUrl, betaUrl])) as [
			{ alpha: () => number; default: string },
			{ beta: () => number },
		];
		expect(alpha.default).toBe('alpha-default');
		expect([alpha.alpha(), beta.beta(), alpha.alpha()]).toEqual([1, 2, 3]);
	});

	it('keeps every file of a package as it was when an import adds another subpath of it', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-new-subpath');
		writePackage(
			path.join(modules, 'subpath-lib'),
			'subpath-lib',
			{ type: 'module', exports: { '.': './index.js', './extra': './extra.js' } },
			{
				'index.js': "export const root = 'root';\n",
				'extra.js': "import { root } from './index.js';\nexport const extra = root + '-extra';\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const rootUrl = await registry.resolveVendorUrl('subpath-lib');
		const served = await readVendorGraph(registry, [rootUrl]);

		const extraUrl = await registry.resolveVendorUrl('subpath-lib/extra');

		for (const [url, code] of served)
			expect([...((await readVendorGraph(registry, [rootUrl])).get(url) ?? [])].join('')).toBe(code);
		expect(onVendorGraphChange).not.toHaveBeenCalled();
		const [extra] = (await importVendorGraph(registry, [extraUrl])) as [{ extra: string }];
		expect(extra.extra).toBe('root-extra');
	});

	it('does not copy a module of a package that another package imports into the importing package file', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-sibling-owner');
		writePackage(
			path.join(modules, 'owner-lib'),
			'owner-lib',
			{ type: 'module', exports: './index.js' },
			{ 'index.js': "export const registry = new Map();\nexport const marker = 'owner-lib-code';\n" },
		);
		writePackage(
			path.join(modules, 'user-lib'),
			'user-lib',
			{ type: 'module', exports: './index.js' },
			{
				'index.js':
					"import { registry } from 'owner-lib';\nexport const use = (key) => registry.set(key, true);\nexport { registry };\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const userUrl = await registry.resolveVendorUrl('user-lib');
		const ownerUrl = await registry.resolveVendorUrl('owner-lib');

		const userFiles = [...(await readVendorGraph(registry, [userUrl])).entries()].filter(([url]) =>
			url.includes('user-lib'),
		);

		expect(userFiles.map(([, code]) => code).join('\n')).not.toContain('owner-lib-code');
		const [user, owner] = (await importVendorGraph(registry, [userUrl, ownerUrl])) as [
			{ registry: Map<string, boolean>; use: (key: string) => unknown },
			{ registry: Map<string, boolean> },
		];
		user.use('shared');
		expect(user.registry).toBe(owner.registry);
		expect(owner.registry.get('shared')).toBe(true);
	});

	it('shares one copy of a CommonJS package between the packages that import and require it', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-cjs-sibling');
		writePackage(
			path.join(modules, 'cjs-owner'),
			'cjs-owner',
			{ main: 'index.cjs' },
			{ 'index.cjs': 'exports.state = { count: 0 };\nexports.bump = () => ++exports.state.count;\n' },
		);
		writePackage(
			path.join(modules, 'es-user'),
			'es-user',
			{ type: 'module', exports: './index.js' },
			{
				'index.js':
					"import { bump, state } from 'cjs-owner';\nexport const useBump = () => bump();\nexport { state };\n",
			},
		);
		writePackage(
			path.join(modules, 'cjs-user'),
			'cjs-user',
			{ main: 'index.cjs' },
			{
				'index.cjs':
					"const owner = require('cjs-owner');\nexports.useBump = () => owner.bump();\nexports.state = owner.state;\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const esUrl = await registry.resolveVendorUrl('es-user');
		const cjsUrl = await registry.resolveVendorUrl('cjs-user');

		const [es, cjs] = (await importVendorGraph(registry, [esUrl, cjsUrl])) as [
			{ useBump: () => number; state: { count: number } },
			{ default: { useBump: () => number; state: { count: number } } },
		];

		expect([es.useBump(), cjs.default.useBump(), es.useBump()]).toEqual([1, 2, 3]);
		expect(es.state).toBe(cjs.default.state);
	});

	it('leaves a subpath that a browser cannot load out of the package file', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-server-subpath');
		writePackage(
			path.join(modules, 'mixed-surface'),
			'mixed-surface',
			{ type: 'module', exports: { '.': './index.js', './server': './server.js' } },
			{
				'index.js': "export const client = 'client-code';\n",
				'server.js':
					"import { readFileSync } from 'node:fs';\nexport const server = () => readFileSync('server-only-marker');\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('mixed-surface');

		const code = [...(await readVendorGraph(registry, [url])).values()].join('\n');

		expect(code).toContain('client-code');
		expect(code).not.toContain('server-only-marker');
		const [lib] = (await importVendorGraph(registry, [url])) as [{ client: string }];
		expect(lib.client).toBe('client-code');
	});

	it('serves a package that ships JSX source as one file per module, together with the other such packages', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-jsx-source');
		writePackage(
			path.join(modules, 'jsx-lib'),
			'jsx-lib',
			{ type: 'module', exports: { '.': './index.tsx', './other': './other.ts' } },
			{
				'index.tsx': "export { other } from './other.ts';\nexport const view = 'jsx-lib-view';\n",
				'other.ts': "export const other = 'jsx-lib-other';\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('jsx-lib');

		const files = await readVendorGraph(registry, [url]);

		expect([...files.keys()].some((file) => file.includes('~package'))).toBe(false);
		expect(files.size).toBe(2);
		const [lib] = (await importVendorGraph(registry, [url])) as [{ view: string; other: string }];
		expect([lib.view, lib.other]).toEqual(['jsx-lib-view', 'jsx-lib-other']);
	});

	it('serves a package with more modules than the limit as one file per module', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-large-package');
		const files: Record<string, string> = {
			'index.js': "export { a } from './a.js';\nexport { b } from './b.js';\n",
		};
		for (const name of ['a', 'b', 'c', 'd']) files[`${name}.js`] = `export const ${name} = '${name}';\n`;
		writePackage(path.join(modules, 'large-lib'), 'large-lib', { type: 'module', exports: './index.js' }, files);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config, maxBundledPackageModules: 3 });
		const url = await registry.resolveVendorUrl('large-lib');

		const served = await readVendorGraph(registry, [url]);

		expect(served.size).toBe(3);
		const [lib] = (await importVendorGraph(registry, [url])) as [{ a: string; b: string }];
		expect([lib.a, lib.b]).toEqual(['a', 'b']);
	});

	it('reports the files of a loaded package that changed on disk, so only pages that loaded them reload', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-graph-edit');
		writePackage(
			path.join(modules, 'edited-lib'),
			'edited-lib',
			{ type: 'module', module: 'index.js' },
			{
				'index.js': "export { label } from './label.js';\n",
				'label.js': "export const label = 'label-v1';\n",
			},
		);
		writePackage(
			path.join(modules, 'steady-lib'),
			'steady-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const steady = 'steady';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });
		const editedUrl = await registry.resolveVendorUrl('edited-lib');
		const steadyUrl = await registry.resolveVendorUrl('steady-lib');
		const served = await readVendorGraph(registry, [editedUrl, steadyUrl]);
		fs.writeFileSync(path.join(modules, 'edited-lib', 'label.js'), "export const label = 'label-v2';\n");

		registry.invalidateAll();
		await registry.resolveVendorUrl('edited-lib');

		expect(onVendorGraphChange).toHaveBeenCalledTimes(1);
		const [changedUrls] = onVendorGraphChange.mock.calls[0] as [string[]];
		const changedFiles = [...served.entries()].filter(([, code]) => code.includes('label-v1')).map(([url]) => url);
		expect(changedFiles).toHaveLength(1);
		expect(changedUrls).toEqual(changedFiles);
		expect(changedUrls).not.toContain(steadyUrl);
	});

	it('does not report a vendor graph change when the output a browser loaded stays the same', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-graph-unchanged');
		for (const name of ['first-lib', 'second-lib']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{ 'index.js': `export const marker = '${name}-code';\n` },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });

		await readVendorGraph(registry, [await registry.resolveVendorUrl('first-lib')]);
		await registry.resolveVendorUrl('second-lib');
		expect(onVendorGraphChange).not.toHaveBeenCalled();
	});

	it('builds the other entries when one entry fails', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-failure');
		writePackage(
			path.join(modules, 'good-lib'),
			'good-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'good-lib-code';\n" },
		);
		writePackage(
			path.join(modules, 'bad-lib'),
			'bad-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export { missing } from './missing.js';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const [good, bad] = await Promise.allSettled([
			registry.resolveVendorUrl('good-lib'),
			registry.resolveVendorUrl('bad-lib'),
		]);

		assert.ok(good.status === 'fulfilled');
		expect([...(await readVendorGraph(registry, [good.value])).values()].join('\n')).toContain('good-lib-code');
		assert.ok(bad.status === 'rejected');
		expect(String(bad.reason)).toContain('Vendor prebundle failed for bad-lib');
		const badEntry = resolveBarePackageBrowserEntry(rootDir, 'bad-lib');
		assert.ok(badEntry);
		const badResponse = await registry.tryHandleVendorRequest(
			getVendorEntryUrl(rootDir, 'module-first', badEntry.path),
		);
		expect(badResponse?.status).toBe(500);
		expect(await badResponse?.text()).toContain('Vendor prebundle failed for bad-lib');
	});

	it.each([
		{ failure: 'every build fails', failResolver: false },
		{ failure: 'the plugin resolver throws', failResolver: true },
	])('keeps serving the last good output when a rebuild fails as a whole ($failure)', async ({ failResolver }) => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-transient');
		for (const name of ['built-lib', 'new-lib']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{ 'index.js': `export const marker = '${name}-code';\n` },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		let failing = false;
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
			resolveVendorBundlePlugins: async () => {
				if (failing && failResolver) throw new Error('transient resolver failure');
				return [];
			},
		});
		const builtUrl = await registry.resolveVendorUrl('built-lib');
		await readVendorGraph(registry, [builtUrl]);

		failing = true;
		registry.invalidateAll();
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		if (!failResolver) {
			bundle.mockResolvedValue({ success: false, logs: [{ message: 'transient install failure' }] });
		}
		await expect(registry.resolveVendorUrl('new-lib')).rejects.toThrow(/transient/);
		bundle.mockRestore();
		failing = false;

		expect([...(await readVendorGraph(registry, [builtUrl])).values()].join('\n')).toContain('built-lib-code');
		const persisted = fs.readFileSync(path.join(config.absolutePaths.workDir, 'dev-vendor-entries.json'), 'utf8');
		expect(persisted).toContain('built-lib');
		expect(persisted).toContain('new-lib');

		const retries = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		await expect(registry.resolveVendorUrl('new-lib')).rejects.toThrow(/transient/);
		expect(bundleCallsUnder(retries, rootDir)).toBe(0);

		const failedAt = Date.now();
		vi.spyOn(Date, 'now').mockReturnValue(failedAt + 2_000);
		const newUrl = await registry.resolveVendorUrl('new-lib');
		expect([...(await readVendorGraph(registry, [newUrl])).values()].join('\n')).toContain('new-lib-code');
		expect(bundleCallsUnder(retries, rootDir)).toBe(2);
		vi.restoreAllMocks();
	});

	it('serves the chunks of the previous build until the rebuild after an invalidation commits', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-stale-chunk');
		writePackage(
			path.join(modules, 'chunked-lib'),
			'chunked-lib',
			{ type: 'module', exports: { '.': './index.js', './hooks': './hooks.js' } },
			{
				'shared.js': "export const context = { marker: 'chunked-shared-code' };\n",
				'index.js': "import { context } from './shared.js';\nexport const providerContext = context;\n",
				'hooks.js': "import { context } from './shared.js';\nexport const hookContext = context;\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const urls = await Promise.all([
			registry.resolveVendorUrl('chunked-lib'),
			registry.resolveVendorUrl('chunked-lib/hooks'),
		]);
		const chunkUrl = [...(await readVendorGraph(registry, urls)).keys()].find((url) => !urls.includes(url));
		assert.ok(chunkUrl, 'expected a shared chunk');

		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		registry.invalidateAll();
		const chunk = await registry.tryHandleVendorRequest(chunkUrl);

		expect(chunk?.status).toBe(200);
		expect(await chunk?.text()).toContain('chunked-shared-code');
		expect(bundleCallsUnder(bundle, rootDir)).toBe(0);
		bundle.mockRestore();
	});

	it('builds the entries a previous dev process discovered on the first request', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-persisted');
		for (const name of ['first-lib', 'second-lib']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{ 'index.js': `export const marker = '${name}-code';\n` },
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const previous = new DevTransformVendorRegistry({ appConfig: config });
		const secondUrl = await previous.resolveVendorUrl('second-lib');
		await previous.resolveVendorUrl('first-lib');
		const entriesFile = path.join(config.absolutePaths.workDir, 'dev-vendor-entries.json');
		const persisted = fs.readFileSync(entriesFile, 'utf8');
		expect(persisted).toContain('first-lib');
		expect(persisted).toContain('second-lib');
		expect(persisted).not.toContain('-code');

		fs.writeFileSync(
			path.join(modules, 'second-lib', 'index.js'),
			"export const marker = 'second-lib-restarted';\n",
		);
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		const restarted = new DevTransformVendorRegistry({ appConfig: config });
		await restarted.resolveVendorUrl('first-lib');

		expect([...(await readVendorGraph(restarted, [secondUrl])).values()].join('\n')).toContain(
			'second-lib-restarted',
		);
		expect(bundleEntriesUnder(bundle, rootDir)).toHaveLength(2);
		expect(bundleEntriesUnder(bundle, rootDir).flat()).toHaveLength(2);
	});

	it('builds a persisted entry from the directory its importer resolved it from', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-persisted-importer');
		const hostDir = path.join(rootDir, 'packages', 'host');
		writePackage(
			path.join(hostDir, 'node_modules', 'host-only-lib'),
			'host-only-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'host-only-code';\n" },
		);
		writePackage(
			path.join(modules, 'app-lib'),
			'app-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'app-lib-code';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const previous = new DevTransformVendorRegistry({ appConfig: config });
		const hostUrl = await previous.resolveVendorUrl('host-only-lib', path.join(hostDir, 'src', 'hydrate.js'));

		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		const restarted = new DevTransformVendorRegistry({ appConfig: config });
		await restarted.resolveVendorUrl('app-lib');

		expect([...(await readVendorGraph(restarted, [hostUrl])).values()].join('\n')).toContain('host-only-code');
		expect(bundleEntriesUnder(bundle, rootDir)).toEqual([
			[expect.stringContaining('host-only-lib')],
			[expect.stringContaining('app-lib')],
		]);
	});

	it('keeps two installed versions on their own URLs after an invalidation', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-invalidate-versions');
		const hostDir = path.join(rootDir, 'packages', 'host');
		writePackage(
			path.join(modules, 'dup-lib'),
			'dup-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'dup-one';\n" },
		);
		writePackage(
			path.join(hostDir, 'node_modules', 'dup-lib'),
			'dup-lib',
			{ type: 'module', module: 'index.js', version: '2.0.0' },
			{ 'index.js': "export const marker = 'dup-two';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const urls = await Promise.all([
			registry.resolveVendorUrl('dup-lib', path.join(config.absolutePaths.srcDir, 'page.js')),
			registry.resolveVendorUrl('dup-lib', path.join(hostDir, 'src', 'hydrate.js')),
		]);

		registry.invalidateAll();

		const [appLib, hostLib] = (await importVendorGraph(registry, urls)) as { marker: string }[];
		expect([appLib.marker, hostLib.marker]).toEqual(['dup-one', 'dup-two']);
	});

	it('ignores a seed file written without resolve directories', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-persisted-legacy');
		writePackage(
			path.join(modules, 'kept-lib'),
			'kept-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'kept-lib-code';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(config.absolutePaths.workDir, { recursive: true });
		fs.writeFileSync(
			path.join(config.absolutePaths.workDir, 'dev-vendor-entries.json'),
			JSON.stringify({ entries: [{ specifier: 'kept-lib', conditions: 'module-first' }] }),
		);
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const url = await registry.resolveVendorUrl('kept-lib');

		expect([...(await readVendorGraph(registry, [url])).values()].join('\n')).toContain('kept-lib-code');
		expect(bundleCallsUnder(bundle, rootDir)).toBe(1);
	});

	it('warns once when a package resolves to two installed copies, naming each copy and its importers', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-duplicate-copies');
		const hostDir = path.join(rootDir, 'packages', 'host');
		for (const [dir, version] of [
			[path.join(modules, 'dup-lib'), '1.0.0'],
			[path.join(hostDir, 'node_modules', 'dup-lib'), '2.0.0'],
		] as const) {
			writePackage(
				dir,
				'dup-lib',
				{ type: 'module', exports: { '.': './index.js', './extra': './extra.js' }, version },
				{ 'index.js': `export const version = '${version}';\n`, 'extra.js': 'export const extra = true;\n' },
			);
		}
		for (const dir of [path.join(rootDir, 'src'), path.join(hostDir, 'src')])
			fs.mkdirSync(dir, { recursive: true });
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const warn = vi.spyOn(appLogger, 'warn');
		const pageModule = path.join(config.absolutePaths.srcDir, 'page.js');

		await registry.resolveVendorUrl('dup-lib', pageModule);
		await registry.resolveVendorUrl('dup-lib/extra', pageModule);
		expect(warn).not.toHaveBeenCalled();
		await registry.resolveVendorUrl('dup-lib', path.join(hostDir, 'src', 'hydrate.js'));
		await registry.resolveVendorUrl('dup-lib/extra', path.join(hostDir, 'src', 'hydrate.js'));

		expect(warn).toHaveBeenCalledTimes(1);
		const message = String(warn.mock.calls[0]?.[0]);
		expect(message).toContain('Package "dup-lib" resolves to 2 installed copies');
		expect(message).toContain(path.fromNative(fs.realpathSync(path.join(modules, 'dup-lib'))));
		expect(message).toContain(path.fromNative(fs.realpathSync(path.join(hostDir, 'node_modules', 'dup-lib'))));
		expect(message).toContain(path.join(path.fromNative(fs.realpathSync(rootDir)), 'src'));
		expect(message).toContain(path.join(path.fromNative(fs.realpathSync(rootDir)), 'packages', 'host', 'src'));
	});

	it('drops the sources of a deleted importer directory after an invalidation', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-prune-sources');
		const hostDir = path.join(rootDir, 'packages', 'host');
		writePackage(
			path.join(modules, 'kept-lib'),
			'kept-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'kept-lib-code';\n" },
		);
		fs.mkdirSync(path.join(hostDir, 'src'), { recursive: true });
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const url = await registry.resolveVendorUrl('kept-lib');
		await registry.resolveVendorUrl('kept-lib', path.join(hostDir, 'src', 'hydrate.js'));
		const entriesFile = path.join(config.absolutePaths.workDir, 'dev-vendor-entries.json');
		const persistedDirs = () =>
			(JSON.parse(fs.readFileSync(entriesFile, 'utf8')) as { entries: { resolveDir: string }[] }).entries.map(
				(entry) => entry.resolveDir,
			);
		fs.writeFileSync(path.join(modules, 'kept-lib', 'index.js'), "export const marker = 'kept-lib-rebuilt';\n");
		registry.invalidateAll();
		await registry.tryHandleVendorRequest(url);
		expect(persistedDirs()).toContain(
			path.join(path.fromNative(fs.realpathSync(rootDir)), 'packages', 'host', 'src'),
		);

		fs.rmSync(hostDir, { recursive: true, force: true });
		fs.writeFileSync(path.join(modules, 'kept-lib', 'index.js'), "export const marker = 'kept-lib-again';\n");
		registry.invalidateAll();
		await registry.tryHandleVendorRequest(url);

		expect(persistedDirs()).toEqual([path.fromNative(fs.realpathSync(rootDir))]);
	});

	/** Guards existing behaviour: Rolldown resolves an entry's imports from its real path in the store. */
	it("bundles an entry's own dependency from the entry's installed location", async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-entry-deps');
		const store = path.join(modules, '.pnpm', 'outer-lib@1.0.0', 'node_modules');
		writePackage(
			path.join(store, 'outer-lib'),
			'outer-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export { marker } from 'inner-lib';\n" },
		);
		writePackage(
			path.join(store, 'inner-lib'),
			'inner-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'inner-lib-code';\n" },
		);
		fs.symlinkSync(path.join(store, 'outer-lib'), path.join(modules, 'outer-lib'), 'dir');
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const url = await registry.resolveVendorUrl('outer-lib');

		const [outer] = (await importVendorGraph(registry, [url])) as { marker: string }[];
		expect(outer.marker).toBe('inner-lib-code');
	});

	it('skips a persisted entry that no longer resolves', async () => {
		const { rootDir, modules } = createAppRoot('dev-transform-vendor-persisted-missing');
		writePackage(
			path.join(modules, 'kept-lib'),
			'kept-lib',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': "export const marker = 'kept-lib-code';\n" },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		fs.mkdirSync(config.absolutePaths.workDir, { recursive: true });
		fs.writeFileSync(
			path.join(config.absolutePaths.workDir, 'dev-vendor-entries.json'),
			JSON.stringify({
				entries: [
					{ specifier: 'removed-lib', resolveDir: rootDir, conditions: 'module-first' },
					{ specifier: 'kept-lib', resolveDir: rootDir, conditions: 'module-first' },
				],
			}),
		);
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const url = await registry.resolveVendorUrl('kept-lib');
		expect([...(await readVendorGraph(registry, [url])).values()].join('\n')).toContain('kept-lib-code');
	});
});
