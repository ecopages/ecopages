import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformServer } from './dev-transform-server.ts';
import { BrowserBundleService } from '../../assets/browser-bundle.service.ts';
import { BuildInputDependencyIndex } from '../../build/cache/build-input-dependency-index.ts';

const tempRoots: string[] = [];

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

describe('DevTransformServer', () => {
	it('serves a module with the new contents of a file its plugin inlined after that file changes', async () => {
		const rootDir = createTempRoot('dev-transform-watch-file');
		const sourcePath = path.join(rootDir, 'src', 'greeting.ts');
		const inlinedPath = path.join(rootDir, 'src', 'greeting.txt');
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, 'export const greeting = GREETING;');
		fs.writeFileSync(inlinedPath, 'before');
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const index = new BuildInputDependencyIndex();
		const server = new DevTransformServer({
			appConfig: config,
			contributors: [
				{
					ownsModule: () => true,
					getModulePlugins: async () => [
						{
							name: 'inline-greeting',
							setup(build) {
								build.transform({ filter: /greeting\.ts$/ }, (code) => {
									build.addWatchFile(inlinedPath);
									return code.replace(
										'GREETING',
										JSON.stringify(fs.readFileSync(inlinedPath, 'utf8')),
									);
								});
							},
						},
					],
				},
			],
			onModuleDependencies: (modulePath, dependencies) =>
				index.register({ consumer: 'entrypoint', key: modulePath }, [modulePath, ...dependencies]),
		});
		const outputUrl = server.registerModule(sourcePath);
		const request = async () =>
			(await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`)))?.text();

		expect(await request()).toContain('"before"');
		fs.writeFileSync(inlinedPath, 'after');
		for (const modulePath of index.resolveKeys('entrypoint', inlinedPath)) server.invalidateSource(modulePath);

		expect(await request()).toContain('"after"');
	});

	it.each([true, false])(
		'retries an edited source during compilation (watcher notified: %s)',
		async (notifyWatcher) => {
			const rootDir = createTempRoot('dev-transform-source-race');
			const sourcePath = path.join(rootDir, 'src', 'index.ts');
			fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
			fs.writeFileSync(sourcePath, 'export const value = "before";');
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const server = new DevTransformServer({ appConfig: config });
			const outputUrl = server.registerModule(sourcePath);
			const started = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			const transpile = vi
				.spyOn(DevTransformBundler.prototype, 'transpileModule')
				.mockImplementation(async () => {
					const code = fs.readFileSync(sourcePath, 'utf8');
					started.resolve();
					await release.promise;
					return { code };
				});

			const response = server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			await started.promise;
			fs.writeFileSync(sourcePath, 'export const value = "after";');
			if (notifyWatcher) {
				server.invalidateSource(sourcePath);
			}
			release.resolve();

			expect(await (await response)?.text()).toContain('"after"');
			const subsequent = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			expect(await subsequent?.text()).toContain('"after"');
			expect(transpile).toHaveBeenCalledTimes(2);
		},
	);

	it.each([true, false])(
		'does not report a failure of a source fixed during compilation (watcher notified: %s)',
		async (notifyWatcher) => {
			const rootDir = createTempRoot('dev-transform-stale-failure');
			const sourcePath = path.join(rootDir, 'src', 'index.ts');
			fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
			fs.writeFileSync(sourcePath, 'export const value = ;');
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const onTransformError = vi.fn();
			const server = new DevTransformServer({ appConfig: config, onTransformError });
			const outputUrl = server.registerModule(sourcePath);
			const started = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			vi.spyOn(DevTransformBundler.prototype, 'transpileModule').mockImplementation(async () => {
				const code = fs.readFileSync(sourcePath, 'utf8');
				if (code.includes('= ;')) {
					started.resolve();
					await release.promise;
					throw new Error('broken build');
				}
				return { code };
			});

			const response = server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			await started.promise;
			fs.writeFileSync(sourcePath, 'export const value = "fixed";');
			if (notifyWatcher) {
				server.invalidateSource(sourcePath);
			}
			release.resolve();

			const settled = await response;
			expect(settled?.status).toBe(200);
			expect(await settled?.text()).toContain('"fixed"');
			expect(onTransformError).not.toHaveBeenCalled();
			expect(server.getFailureMessages()).toEqual([]);
		},
	);

	it.each(['source', 'all'] as const)(
		'serializes concurrent requests across %s invalidation with unchanged bytes',
		async (scope) => {
			const rootDir = createTempRoot('dev-transform-concurrent-invalidation');
			const sourcePath = path.join(rootDir, 'src', 'index.ts');
			fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
			fs.writeFileSync(sourcePath, 'export const value = true;');
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const server = new DevTransformServer({ appConfig: config });
			const outputUrl = server.registerModule(sourcePath);
			const started = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			let attempts = 0;
			let active = 0;
			let maxActive = 0;
			const transpile = vi
				.spyOn(DevTransformBundler.prototype, 'transpileModule')
				.mockImplementation(async () => {
					const attempt = ++attempts;
					maxActive = Math.max(maxActive, ++active);
					try {
						started.resolve();
						await release.promise;
						return { code: `export const attempt = ${attempt};` };
					} finally {
						active--;
					}
				});

			const first = server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			await started.promise;
			if (scope === 'source') {
				server.invalidateSource(sourcePath);
			} else {
				server.invalidateAll();
			}
			const second = server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			const callsBeforeRelease = transpile.mock.calls.length;
			release.resolve();
			const responses = await Promise.all([first, second]);

			expect(callsBeforeRelease).toBe(1);
			expect(maxActive).toBe(1);
			expect(transpile).toHaveBeenCalledTimes(2);
			for (const response of responses) {
				expect(response?.status).toBe(200);
				expect(await response?.text()).toContain('attempt = 2');
			}
			const cached = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));
			expect(await cached?.text()).toContain('attempt = 2');
			expect(transpile).toHaveBeenCalledTimes(2);
		},
	);

	it('answers a vendor request with 304 when If-None-Match carries its ETag', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-etag');
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'vendor-etag-app', type: 'module' }),
		);
		const packageDir = path.join(rootDir, 'node_modules', 'fixture-lib');
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name: 'fixture-lib', version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(packageDir, 'index.js'), 'export const release = 1;');
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });
		const sourcePath = path.join(config.absolutePaths.srcDir, 'vendor-consumer.ts');
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, "import { release } from 'fixture-lib';\nexport { release };\n");
		const moduleUrl = server.registerModule(sourcePath);
		const consumer = await server.tryHandleRequest(new Request(`http://localhost${moduleUrl}`));
		const consumerCode = await consumer?.text();
		const vendorUrl = consumerCode?.match(/['"](\/assets\/vendors\/[^'"]+)['"]/u)?.[1];
		expect(vendorUrl).toBeTruthy();

		const first = await server.tryHandleRequest(new Request(`http://localhost${vendorUrl}`));
		const etag = first?.headers.get('ETag');
		expect(etag).toBeTruthy();
		expect(fs.existsSync(path.join(config.absolutePaths.distDir, vendorUrl!.slice('/'.length)))).toBe(false);

		const revalidated = await server.tryHandleRequest(
			new Request(`http://localhost${vendorUrl}`, { headers: { 'If-None-Match': `${etag}` } }),
		);
		expect(revalidated?.status).toBe(304);
	});

	it('registerModule returns a stable dev-transform URL', async () => {
		const rootDir = createTempRoot('dev-transform-server-register');
		const config = await finalizeEcoPagesConfig({ rootDir });
		const server = new DevTransformServer({ appConfig: config });
		const sourcePath = path.join(config.absolutePaths.srcDir, 'pages', 'index.tsx');

		const firstUrl = server.registerModule(sourcePath);
		const secondUrl = server.registerModule(sourcePath);

		expect(firstUrl).toBe(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		expect(secondUrl).toBe(firstUrl);
		expect(server.getRegisteredSourcePath(firstUrl)).toBe(path.resolve(sourcePath));
	});

	it('reset clears registered modules', async () => {
		const rootDir = createTempRoot('dev-transform-server-reset');
		const config = await finalizeEcoPagesConfig({ rootDir });
		const server = new DevTransformServer({ appConfig: config });
		const sourcePath = path.join(config.absolutePaths.srcDir, 'pages', 'about.tsx');
		const outputUrl = server.registerModule(sourcePath);

		server.reset();

		expect(server.getRegisteredSourcePath(outputUrl)).toBeUndefined();
		expect(server.getWatchedModules().size).toBe(0);
	});

	it('tryHandleRequest returns null for unknown module URLs', async () => {
		const rootDir = createTempRoot('dev-transform-server-unknown');
		const config = await finalizeEcoPagesConfig({ rootDir });
		const server = new DevTransformServer({ appConfig: config });

		const response = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/missing.js`),
		);

		expect(response).toBeNull();
	});

	it('materializes registered modules on request', async () => {
		const rootDir = createTempRoot('dev-transform-server-materialize');
		const srcDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(srcDir, { recursive: true });
		const entrypointPath = path.join(srcDir, 'index.tsx');
		fs.writeFileSync(entrypointPath, 'export const page = true;\n', 'utf8');

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });

		const outputUrl = server.registerModule(entrypointPath);
		const response = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));

		expect(response?.ok).toBe(true);
		expect(await response?.text()).toContain('page');
	});

	it('materializes unregistered page URLs requested during client navigation', async () => {
		const rootDir = createTempRoot('dev-transform-server-lazy-register');
		const srcDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(srcDir, { recursive: true });
		const entrypointPath = path.join(srcDir, 'index.tsx');
		fs.writeFileSync(entrypointPath, 'export const home = true;\n', 'utf8');

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });

		const response = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`),
		);

		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Type')).toContain('javascript');
		expect(await response!.text()).toContain('home');
		expect(server.getRegisteredSourcePath(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`)).toBe(
			path.resolve(entrypointPath),
		);
	});

	it('serves sibling modules referenced by rewritten dynamic imports', async () => {
		const rootDir = createTempRoot('dev-transform-server-chunks');
		const srcDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(srcDir, { recursive: true });
		fs.writeFileSync(path.join(srcDir, 'lazy-part.ts'), "export const lazyValue = 'chunked';\n", 'utf8');
		const entrypointPath = path.join(srcDir, 'index.tsx');
		fs.writeFileSync(
			entrypointPath,
			"export async function loadLazy() {\n  const mod = await import('./lazy-part.ts');\n  return mod.lazyValue;\n}\n",
			'utf8',
		);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });
		const outputUrl = server.registerModule(entrypointPath);
		const entryResponse = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));

		expect(entryResponse?.ok).toBe(true);
		const entryCode = await entryResponse!.text();
		expect(entryCode).toMatch(new RegExp(`${DEV_TRANSFORM_URL_PREFIX}/pages/lazy-part\\.js\\?v=[0-9a-f]+`));

		const chunkResponse = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/pages/lazy-part.js`),
		);
		expect(chunkResponse?.status).toBe(200);
		expect(await chunkResponse!.text()).toContain('chunked');
	});

	it('materializes imported stylesheets as default-exported CSS strings', async () => {
		const rootDir = createTempRoot('dev-transform-server-css');
		const componentsDir = path.join(rootDir, 'src', 'components');
		fs.mkdirSync(componentsDir, { recursive: true });
		const cssPath = path.join(componentsDir, 'widget.css');
		fs.writeFileSync(cssPath, ':host { color: tomato; }\n', 'utf8');

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });

		const response = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/components/widget.css`),
		);

		expect(response?.status).toBe(200);
		expect(await response!.text()).toContain('export default ":host { color: tomato; }\\n"');
	});
	function writeFixturePackage(rootDir: string, name: string, source: string): void {
		const packageDir = path.join(rootDir, 'node_modules', name);
		fs.mkdirSync(packageDir, { recursive: true });
		fs.writeFileSync(
			path.join(packageDir, 'package.json'),
			JSON.stringify({ name, version: '1.0.0', type: 'module', module: 'index.js' }),
		);
		fs.writeFileSync(path.join(packageDir, 'index.js'), source);
	}

	async function requestConsumer(server: DevTransformServer, sourcePath: string, code: string): Promise<string> {
		fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
		fs.writeFileSync(sourcePath, code);
		const response = await server.tryHandleRequest(
			new Request(`http://localhost${server.registerModule(sourcePath)}`),
		);
		expect(response?.status).toBe(200);
		return (await response?.text()) ?? '';
	}

	function vendorBuildsUnder(bundle: { mock: { calls: unknown[][] } }, rootDir: string): number {
		const modules = path.join(fs.realpathSync(rootDir), 'node_modules');
		return bundle.mock.calls.filter(([options]) =>
			Object.values((options as { entrypoints: Record<string, string> }).entrypoints).some((entry) =>
				entry.startsWith(modules),
			),
		).length;
	}

	it('builds the vendor graph once for a module that imports five new packages', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-batch');
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'vendor-batch-app', type: 'module' }),
		);
		const names = ['lib-a', 'lib-b', 'lib-c', 'lib-d', 'lib-e'];
		for (const name of names) writeFixturePackage(rootDir, name, `export const marker = '${name}';\n`);
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });
		const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');

		const code = await requestConsumer(
			server,
			path.join(config.absolutePaths.srcDir, 'many-vendors.ts'),
			`${names.map((name, index) => `import { marker as m${index} } from '${name}';`).join('\n')}\nexport const markers = [m0, m1, m2, m3, m4];\n`,
		);

		expect(code.match(/\/assets\/vendors\//gu)).toHaveLength(5);
		expect(vendorBuildsUnder(bundle, rootDir)).toBe(1);
	});

	it.each(['constructor', 'addContributor'] as const)(
		'builds the vendor entries a contributor declares through %s in the first vendor build',
		async (registration) => {
			const rootDir = createTempRoot('dev-transform-known-vendors');
			fs.writeFileSync(
				path.join(rootDir, 'package.json'),
				JSON.stringify({ name: 'known-vendors', type: 'module' }),
			);
			for (const name of ['lib-a', 'lib-b'])
				writeFixturePackage(rootDir, name, `export const marker = '${name}';\n`);
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const contributor = {
				ownsModule: () => false,
				getModulePlugins: async () => [],
				getVendorEntries: () => ({ resolveFrom: rootDir, specifiers: ['lib-a', 'lib-b'] }),
			};
			const server = new DevTransformServer({
				appConfig: config,
				contributors: registration === 'constructor' ? [contributor] : [],
			});
			if (registration === 'addContributor') server.addContributor(contributor);
			const bundle = vi.spyOn(BrowserBundleService.prototype, 'bundle');

			await requestConsumer(
				server,
				path.join(config.absolutePaths.srcDir, 'a.ts'),
				"export { marker } from 'lib-a';\n",
			);
			await requestConsumer(
				server,
				path.join(config.absolutePaths.srcDir, 'b.ts'),
				"export { marker } from 'lib-b';\n",
			);

			expect(vendorBuildsUnder(bundle, rootDir)).toBe(1);
		},
	);

	describe('a bare import resolves from the module that imports it', () => {
		/** Writes an ES module package at `packageDir` whose `index.js` exports `marker`. */
		function writePackageAt(packageDir: string, name: string, version: string, marker: string): void {
			fs.mkdirSync(packageDir, { recursive: true });
			fs.writeFileSync(
				path.join(packageDir, 'package.json'),
				JSON.stringify({ name, version, type: 'module', module: 'index.js' }),
			);
			fs.writeFileSync(path.join(packageDir, 'index.js'), `export const marker = '${marker}';\n`);
		}

		/** An app with a workspace package `host` at `packages/host`, laid out as pnpm links it. */
		async function createWorkspaceApp(prefix: string) {
			const rootDir = fs.realpathSync(createTempRoot(prefix));
			fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ name: 'app', type: 'module' }));
			const hostDir = path.join(rootDir, 'packages', 'host');
			fs.mkdirSync(path.join(hostDir, 'src'), { recursive: true });
			fs.writeFileSync(path.join(hostDir, 'package.json'), JSON.stringify({ name: 'host', type: 'module' }));
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			return { rootDir, hostDir, config, server: new DevTransformServer({ appConfig: config }) };
		}

		async function vendorUrlOf(server: DevTransformServer, importerPath: string, specifier: string) {
			const code = await server.rewriteImports(`export { marker } from '${specifier}';\n`, importerPath);
			const url = code.match(/['"](\/assets\/vendors\/[^'"]+)['"]/u)?.[1];
			if (!url) throw new Error(`no vendor URL in ${code}`);
			return url;
		}

		async function readVendor(server: DevTransformServer, url: string) {
			const response = await server.tryHandleRequest(new Request(`http://localhost${url}`));
			expect(response?.status).toBe(200);
			return (await response?.text()) ?? '';
		}

		it('serves a dependency that only the importing workspace package declares', async () => {
			const { rootDir, hostDir, server } = await createWorkspaceApp('dev-transform-vendor-transitive');
			writePackageAt(path.join(hostDir, 'node_modules', 'host-only-lib'), 'host-only-lib', '1.0.0', 'host-only');
			expect(fs.existsSync(path.join(rootDir, 'node_modules', 'host-only-lib'))).toBe(false);

			const url = await vendorUrlOf(server, path.join(hostDir, 'src', 'hydrate.js'), 'host-only-lib');

			expect(await readVendor(server, url)).toContain('"host-only"');
		});

		it("serves a linked package's dependency from beside it in the pnpm store", async () => {
			const { rootDir, server } = await createWorkspaceApp('dev-transform-vendor-linked-importer');
			const store = path.join(rootDir, 'node_modules', '.pnpm', 'linked-host@1.0.0', 'node_modules');
			writePackageAt(path.join(store, 'linked-host'), 'linked-host', '1.0.0', 'linked-host');
			writePackageAt(path.join(store, 'store-only-lib'), 'store-only-lib', '1.0.0', 'store-only');
			fs.symlinkSync(path.join(store, 'linked-host'), path.join(rootDir, 'node_modules', 'linked-host'), 'dir');

			const url = await vendorUrlOf(
				server,
				path.join(rootDir, 'node_modules', 'linked-host', 'hydrate.js'),
				'store-only-lib',
			);

			expect(await readVendor(server, url)).toContain('"store-only"');
		});

		it('gives two installed versions of one package two vendor URLs', async () => {
			const { rootDir, hostDir, config, server } = await createWorkspaceApp('dev-transform-vendor-versions');
			writePackageAt(path.join(rootDir, 'node_modules', 'dup-lib'), 'dup-lib', '1.0.0', 'dup-one');
			writePackageAt(path.join(hostDir, 'node_modules', 'dup-lib'), 'dup-lib', '2.0.0', 'dup-two');

			const appUrl = await vendorUrlOf(server, path.join(config.absolutePaths.srcDir, 'page.js'), 'dup-lib');
			const hostUrl = await vendorUrlOf(server, path.join(hostDir, 'src', 'hydrate.js'), 'dup-lib');

			expect(appUrl).not.toBe(hostUrl);
			expect(await readVendor(server, appUrl)).toContain('"dup-one"');
			expect(await readVendor(server, hostUrl)).toContain('"dup-two"');
		});

		it('gives a package that two importers resolve to the same file one vendor URL', async () => {
			const { rootDir, hostDir, config, server } = await createWorkspaceApp('dev-transform-vendor-linked');
			const storeDir = path.join(
				rootDir,
				'node_modules',
				'.pnpm',
				'shared-lib@1.0.0',
				'node_modules',
				'shared-lib',
			);
			writePackageAt(storeDir, 'shared-lib', '1.0.0', 'shared');
			for (const modules of [path.join(rootDir, 'node_modules'), path.join(hostDir, 'node_modules')]) {
				fs.mkdirSync(modules, { recursive: true });
				fs.symlinkSync(storeDir, path.join(modules, 'shared-lib'), 'dir');
			}

			const appUrl = await vendorUrlOf(server, path.join(config.absolutePaths.srcDir, 'page.js'), 'shared-lib');
			const hostUrl = await vendorUrlOf(server, path.join(hostDir, 'src', 'hydrate.js'), 'shared-lib');

			expect(hostUrl).toBe(appUrl);
		});
	});

	it('rebuilds the vendor graph when the lockfile changes', async () => {
		const rootDir = createTempRoot('dev-transform-vendor-lockfile');
		fs.writeFileSync(
			path.join(rootDir, 'package.json'),
			JSON.stringify({ name: 'vendor-lockfile-app', type: 'module' }),
		);
		const lockfile = path.join(rootDir, 'pnpm-lock.yaml');
		fs.writeFileSync(lockfile, 'lockfileVersion: one\n');
		writeFixturePackage(rootDir, 'fixture-lib', "export const release = 'release-one';\n");
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });
		const consumer = await requestConsumer(
			server,
			path.join(config.absolutePaths.srcDir, 'vendor-consumer.ts'),
			"import { release } from 'fixture-lib';\nexport { release };\n",
		);
		const vendorUrl = consumer.match(/['"](\/assets\/vendors\/[^'"]+)['"]/u)?.[1];
		const readVendor = async () =>
			(await server.tryHandleRequest(new Request(`http://localhost${vendorUrl}`)))?.text();
		expect(await readVendor()).toContain('release-one');

		writeFixturePackage(rootDir, 'fixture-lib', "export const release = 'release-two';\n");
		expect(await readVendor()).toContain('release-one');

		fs.writeFileSync(lockfile, 'lockfileVersion: two, reinstalled\n');
		const later = new Date(Date.now() + 60_000);
		fs.utimesSync(lockfile, later, later);
		vi.spyOn(Date, 'now').mockReturnValue(later.getTime());
		expect(await readVendor()).toContain('release-two');
	});
});
