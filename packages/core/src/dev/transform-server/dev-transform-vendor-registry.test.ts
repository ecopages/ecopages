import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import { contentHash } from '../../utils/content-hash.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';
import { appLogger } from '../../global/app-logger.ts';

const tempRoots: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
const docsRoot = path.join(repoRoot, 'apps', 'docs');

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	vi.restoreAllMocks();
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

/** Relative imports of a served vendor file, resolved to the URLs the browser would request. */
function relativeVendorImports(url: string, code: string): string[] {
	const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)].map((match) => match[1]);
	return specifiers.map((specifier) => path.join(path.dirname(url), specifier));
}

/** Every vendor file the browser loads for `urls`, by URL. */
async function readVendorGraph(registry: DevTransformVendorRegistry, urls: string[]): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	const pending = [...urls];
	while (pending.length > 0) {
		const url = pending.pop();
		if (!url || files.has(url)) continue;
		const response = await registry.tryHandleVendorRequest(url);
		assert.ok(response, `no vendor response for ${url}`);
		expect(response.status).toBe(200);
		const code = await response.text();
		files.set(url, code);
		pending.push(...relativeVendorImports(url, code));
	}
	return files;
}

/**
 * Writes the vendor files that `urls` load to a directory and imports each URL there.
 *
 * @remarks
 * Node evaluates them as the browser would: one module per file, linked by their relative imports.
 */
async function importVendorGraph(registry: DevTransformVendorRegistry, urls: string[]): Promise<unknown[]> {
	const directory = fs.realpathSync(createTempRoot('dev-transform-vendor-eval'));
	for (const [url, code] of await readVendorGraph(registry, urls)) {
		const file = path.join(directory, url.slice('/'.length));
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, code);
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
	const realRoot = fs.realpathSync(rootDir);
	return bundle.mock.calls
		.map(([options]) => Object.values((options as { entrypoints: Record<string, string> }).entrypoints))
		.filter((entries) => entries.some((entry) => entry.startsWith(realRoot)))
		.map((entries) => entries.filter((entry) => entry.startsWith(realRoot)));
}

describe('DevTransformVendorRegistry', () => {
	it('resolves @ecopages/core to the browser package entry', () => {
		const resolved = resolveBarePackageBrowserEntry(docsRoot, '@ecopages/core');
		assert.ok(resolved);
		expect(resolved.path).toMatch(/index\.browser\.ts$/);
	});

	it('prebundles @ecopages/core without Node builtins', async () => {
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
		expect(url).toMatch(/^\/assets\/vendors\/ecopages-core\.[a-f0-9]+\.js$/);
		expect(fs.existsSync(path.join(config.absolutePaths.distDir, url.slice('/'.length)))).toBe(false);

		const response = await registry.tryHandleVendorRequest(url);
		assert.ok(response);
		const code = await response.text();
		expect(code).not.toMatch(/node:(?:fs|path|async_hooks|crypto)/);
		expect(code).toMatch(/eco/);
	});

	it("points a package's @ecopages/core imports at core's browser-first entry", async () => {
		const rootDir = fs.realpathSync(createTempRoot('dev-transform-vendor-core-import'));
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

		const routerCode = (await readVendorGraph(registry, [routerUrl])).get(routerUrl) ?? '';
		expect(routerCode).toContain(`from "${coreClientUrl}"`);
		expect(routerCode).not.toContain('packages/core/src');
	});

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
			[expect.stringContaining('known-a'), expect.stringContaining('known-b')],
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
			[expect.stringContaining('shared-lib@1.0.0'), expect.stringContaining('shared-lib@2.0.0')],
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

	it('serves a cached vendor bundle from memory without a disk output', async () => {
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
	});

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
		const response = await restarted.tryHandleVendorRequest(newUrl);
		assert.ok(response);
		expect(await response.text()).toContain('release-1.0.1');
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
		const readServed = async (registry: DevTransformVendorRegistry, url: string) => {
			const response = await registry.tryHandleVendorRequest(url);
			assert.ok(response);
			return response.text();
		};

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
		expect(restartedUrl).toMatch(/^\/assets\/vendors\/acme-ui\.[a-f0-9]+\.js$/);
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

		const response = await registry.tryHandleVendorRequest(url);
		assert.ok(response);
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		const etag = response.headers.get('ETag');
		assert.ok(etag);

		const revalidated = await registry.tryHandleVendorRequest(url, etag);
		expect(revalidated?.status).toBe(304);
		for (const ifNoneMatch of [`"other", W/${etag}`, ` ${etag} `, '*']) {
			expect((await registry.tryHandleVendorRequest(url, ifNoneMatch))?.status).toBe(304);
		}
		expect((await registry.tryHandleVendorRequest(url, '"other"'))?.status).toBe(200);

		fs.writeFileSync(path.join(rootDir, 'node_modules', 'fixture-lib', 'index.js'), 'export const release = 22;');
		registry.invalidateAll();
		const changedUrl = await registry.resolveVendorUrl('fixture-lib');
		const changed = await registry.tryHandleVendorRequest(changedUrl, etag);
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

	it('reports a change to a file an earlier build served and the build after it kept', async () => {
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
		await readVendorGraph(registry, [await registry.resolveVendorUrl('lib-a')]);
		await registry.resolveVendorUrl('lib-b');
		expect(onVendorGraphChange).not.toHaveBeenCalled();

		await registry.resolveVendorUrl('lib-c');

		expect(onVendorGraphChange).toHaveBeenCalledTimes(1);
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

	it('reports a vendor graph change only when a browser loaded output that the rebuild changed', async () => {
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
		writePackage(
			path.join(modules, 'standalone'),
			'standalone',
			{ type: 'module', module: 'index.js' },
			{ 'index.js': 'export const standalone = true;\n' },
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const onVendorGraphChange = vi.fn();
		const registry = new DevTransformVendorRegistry({ appConfig: config, onVendorGraphChange });

		const pluginA = await registry.resolveVendorUrl('plugin-a');
		await registry.resolveVendorUrl('standalone');
		expect(onVendorGraphChange).not.toHaveBeenCalled();

		await readVendorGraph(registry, [pluginA]);
		await registry.resolveVendorUrl('plugin-b');
		expect(onVendorGraphChange).toHaveBeenCalledTimes(1);
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
			`/assets/vendors/bad-lib.${contentHash(badEntry.path, 8)}.js`,
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
		expect(bundleCallsUnder(retries, rootDir)).toBe(1);
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

		const response = await restarted.tryHandleVendorRequest(secondUrl);
		assert.ok(response);
		expect(await response.text()).toContain('second-lib-restarted');
		const builds = bundleEntriesUnder(bundle, rootDir);
		expect(builds).toHaveLength(1);
		expect(builds[0]).toHaveLength(2);
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

		expect(await (await restarted.tryHandleVendorRequest(hostUrl))?.text()).toContain('host-only-code');
		expect(bundleEntriesUnder(bundle, rootDir)).toEqual([
			[expect.stringContaining('host-only-lib'), expect.stringContaining('app-lib')],
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
		expect(message).toContain(fs.realpathSync(path.join(modules, 'dup-lib')));
		expect(message).toContain(fs.realpathSync(path.join(hostDir, 'node_modules', 'dup-lib')));
		expect(message).toContain(path.join(fs.realpathSync(rootDir), 'src'));
		expect(message).toContain(path.join(fs.realpathSync(rootDir), 'packages', 'host', 'src'));
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
		expect(persistedDirs()).toContain(path.join(fs.realpathSync(rootDir), 'packages', 'host', 'src'));

		fs.rmSync(hostDir, { recursive: true, force: true });
		fs.writeFileSync(path.join(modules, 'kept-lib', 'index.js'), "export const marker = 'kept-lib-again';\n");
		registry.invalidateAll();
		await registry.tryHandleVendorRequest(url);

		expect(persistedDirs()).toEqual([fs.realpathSync(rootDir)]);
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
