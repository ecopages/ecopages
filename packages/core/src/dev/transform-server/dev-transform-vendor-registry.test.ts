import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';

const tempRoots: string[] = [];
const repoRoot = path.resolve(import.meta.dirname, '../../../../..');
const docsRoot = path.join(repoRoot, 'apps', 'docs');

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

/** Vendor URLs a vendor bundle imports. */
function vendorImports(code: string): string[] {
	return [...code.matchAll(/from\s*["'](\/assets\/vendors\/[^"']+)["']/g)].map((match) => match[1]);
}

/**
 * Counts `bundle()` calls for entries under `rootDir`.
 *
 * @remarks
 * Earlier tests leave dependency vendors building in the background, and the prototype spy sees those calls too.
 */
function bundleCallsUnder(bundle: { mock: { calls: unknown[][] } }, rootDir: string): number {
	const realRoot = fs.realpathSync(rootDir);
	return bundle.mock.calls.filter(([options]) =>
		(options as { entrypoints: string[] }).entrypoints.some((entry) => entry.startsWith(realRoot)),
	).length;
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
		registry.invalidateAll();
		const url = await stale;

		expect(await registry.tryHandleVendorRequest(url)).toBeNull();
		await registry.resolveVendorUrl('fixture-lib');
		expect(bundleCallsUnder(bundle, lastFixtureRoot)).toBe(2);
		expect(await registry.tryHandleVendorRequest(url)).not.toBeNull();
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
		const readRelease = async (registry: DevTransformVendorRegistry, url: string) => {
			const response = await registry.tryHandleVendorRequest(url);
			assert.ok(response);
			return response.text();
		};

		const readDependency = async (registry: DevTransformVendorRegistry, url: string) => {
			const [dependencyUrl] = vendorImports(await readRelease(registry, url));
			assert.ok(dependencyUrl);
			return readRelease(registry, dependencyUrl);
		};

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
		const [dependencyUrl] = vendorImports(restartedCode);
		expect(dependencyUrl).toMatch(/^\/assets\/vendors\/ui-dep\.[a-f0-9]+\.js$/);
		expect(await readServed(restarted, dependencyUrl)).toContain('ui-dep-code');
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

	it('loads a package that two vendors import from one shared vendor', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-shared');
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
		const modules = path.join(rootDir, 'node_modules');
		writePackage(
			path.join(modules, 'shared-core'),
			'shared-core',
			{ type: 'module', module: 'index.js' },
			{
				'index.js': "export const registry = new Map(); export const marker = 'shared-core-code';\n",
			},
		);
		for (const name of ['plugin-a', 'plugin-b']) {
			writePackage(
				path.join(modules, name),
				name,
				{ type: 'module', module: 'index.js' },
				{
					'index.js': `import { registry } from 'shared-core';\nexport const register = () => registry.set('${name}', true);\n`,
				},
			);
		}
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });
		const read = async (url: string) => {
			const response = await registry.tryHandleVendorRequest(url);
			assert.ok(response);
			return response.text();
		};

		const pluginA = await read(await registry.resolveVendorUrl('plugin-a'));
		const pluginB = await read(await registry.resolveVendorUrl('plugin-b'));
		const sharedUrl = await registry.resolveVendorUrl('shared-core');

		expect(vendorImports(pluginA)).toEqual([sharedUrl]);
		expect(vendorImports(pluginB)).toEqual([sharedUrl]);
		expect(pluginA).not.toContain('shared-core-code');
		expect(pluginB).not.toContain('shared-core-code');
		expect(await read(sharedUrl)).toContain('shared-core-code');
	});

	it('keeps a required dependency inside the vendor that requires it', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-require');
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
		const modules = path.join(rootDir, 'node_modules');
		writePackage(
			path.join(modules, 'cjs-dep'),
			'cjs-dep',
			{ main: 'index.js' },
			{
				'index.js': "module.exports = { marker: 'cjs-dep-code' };\n",
			},
		);
		writePackage(
			path.join(modules, 'cjs-lib'),
			'cjs-lib',
			{ main: 'index.js' },
			{
				'index.js': "module.exports = require('cjs-dep');\n",
			},
		);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const registry = new DevTransformVendorRegistry({ appConfig: config });

		const response = await registry.tryHandleVendorRequest(await registry.resolveVendorUrl('cjs-lib'));
		assert.ok(response);
		const code = await response.text();

		expect(code).toContain('cjs-dep-code');
		expect(vendorImports(code)).toEqual([]);
	});
});
