import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import { resolveBarePackageBrowserEntry } from '../../plugins/tsconfig-import-resolver.ts';
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
		installBuildRuntime(config);
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
		});

		const url = await registry.resolveVendorUrl('@ecopages/core');
		expect(url).toMatch(/^\/assets\/vendors\/ecopages-core\.[a-f0-9]+\.js$/);
		expect(fs.existsSync(path.join(config.absolutePaths.distDir, url.slice('/'.length)))).toBe(false);

		const response = registry.tryHandleVendorRequest(url);
		assert.ok(response);
		const code = await response.text();
		expect(code).not.toMatch(/node:(?:fs|path|async_hooks|crypto)/);
		expect(code).toMatch(/eco/);
	});

	it('does not alias package subpaths to a root runtime vendor', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-subpath');
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'dev-transform-vendor-subpath', type: 'module' }, null, 2),
			'utf8',
		);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		installBuildRuntime(config);
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map([['@acme/ui', '/assets/vendors/acme-ui.development.js']]),
		});

		const vendorsDir = path.join(config.absolutePaths.distDir, 'assets', 'vendors');
		fs.mkdirSync(vendorsDir, { recursive: true });
		const vendorPath = path.join(vendorsDir, 'acme-ui.development.js');
		fs.writeFileSync(vendorPath, 'export const shared = 1;');

		expect(registry.resolveKnownVendorUrl('@acme/ui/button')).toBeUndefined();
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
		installBuildRuntime(config);
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
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
		installBuildRuntime(config);
		const registry = new DevTransformVendorRegistry({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
		});

		const url = await registry.resolveVendorUrl('@ecopages/core');
		const outputPath = path.join(config.absolutePaths.distDir, url.slice('/'.length));
		expect(fs.existsSync(outputPath)).toBe(false);
		const response = registry.tryHandleVendorRequest(url);
		assert.ok(response);
		expect(await response.text()).toContain('eco');
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
		installBuildRuntime(config);
		const createRegistry = () =>
			new DevTransformVendorRegistry({ appConfig: config, getRuntimeSpecifierMap: () => new Map() });

		installVersion('1.0.0');
		const oldUrl = await createRegistry().resolveVendorUrl(fixture.importName);

		installVersion('1.0.1');
		const restarted = createRegistry();
		const newUrl = await restarted.resolveVendorUrl(fixture.importName);

		expect(newUrl).toBe(oldUrl);
		const response = restarted.tryHandleVendorRequest(newUrl);
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
		installBuildRuntime(config);
		const createRegistry = () =>
			new DevTransformVendorRegistry({ appConfig: config, getRuntimeSpecifierMap: () => new Map() });
		const readRelease = async (registry: DevTransformVendorRegistry, url: string) => {
			const response = registry.tryHandleVendorRequest(url);
			assert.ok(response);
			return response.text();
		};

		writeDependency(1);
		const firstProcess = createRegistry();
		const url = await firstProcess.resolveVendorUrl('fixture-lib');
		expect(await readRelease(firstProcess, url)).toContain('release = 1');

		writeDependency(2);
		const restarted = createRegistry();
		const restartedUrl = await restarted.resolveVendorUrl('fixture-lib');
		expect(restartedUrl).toBe(url);
		expect(await readRelease(restarted, restartedUrl)).toContain('release = 2');
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
		installBuildRuntime(config);
		const createRegistry = () =>
			new DevTransformVendorRegistry({ appConfig: config, getRuntimeSpecifierMap: () => new Map() });
		const readServed = async (registry: DevTransformVendorRegistry, url: string) => {
			const response = registry.tryHandleVendorRequest(url);
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
		expect(restartedCode).toContain('ui-dep-code');
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
		installBuildRuntime(config);
		const registry = new DevTransformVendorRegistry({ appConfig: config, getRuntimeSpecifierMap: () => new Map() });
		const url = await registry.resolveVendorUrl('fixture-lib');

		const response = registry.tryHandleVendorRequest(url);
		assert.ok(response);
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		const etag = response.headers.get('ETag');
		assert.ok(etag);

		const revalidated = registry.tryHandleVendorRequest(url, etag);
		expect(revalidated?.status).toBe(304);
		for (const ifNoneMatch of [`"other", W/${etag}`, ` ${etag} `, '*']) {
			expect(registry.tryHandleVendorRequest(url, ifNoneMatch)?.status).toBe(304);
		}
		expect(registry.tryHandleVendorRequest(url, '"other"')?.status).toBe(200);

		fs.writeFileSync(path.join(rootDir, 'node_modules', 'fixture-lib', 'index.js'), 'export const release = 22;');
		registry.invalidateAll();
		const changedUrl = await registry.resolveVendorUrl('fixture-lib');
		const changed = registry.tryHandleVendorRequest(changedUrl, etag);
		expect(changed?.status).toBe(200);
		expect(await changed?.text()).toContain('release = 22');
	});
});
