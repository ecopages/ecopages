import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/finalize-config.ts';
import { DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformServer } from './dev-transform-server.ts';

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
		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const server = new DevTransformServer({ appConfig: config });
		const vendorsDir = path.join(config.absolutePaths.distDir, 'assets', 'vendors');
		fs.mkdirSync(vendorsDir, { recursive: true });
		fs.writeFileSync(path.join(vendorsDir, 'fixture-lib.js'), 'export const release = 1;');
		const url = 'http://localhost/assets/vendors/fixture-lib.js';

		const first = await server.tryHandleRequest(new Request(url));
		const etag = first?.headers.get('ETag');
		expect(etag).toBeTruthy();

		const revalidated = await server.tryHandleRequest(
			new Request(url, { headers: { 'If-None-Match': `${etag}` } }),
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
		installBuildRuntime(config);
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
		installBuildRuntime(config);
		const server = new DevTransformServer({ appConfig: config });

		const response = await server.tryHandleRequest(
			new Request(`http://localhost${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`),
		);

		expect(response?.status).toBe(200);
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
		installBuildRuntime(config);
		const server = new DevTransformServer({ appConfig: config });
		const outputUrl = server.registerModule(entrypointPath);
		const entryResponse = await server.tryHandleRequest(new Request(`http://localhost${outputUrl}`));

		expect(entryResponse?.ok).toBe(true);
		const entryCode = await entryResponse!.text();
		const chunkUrlMatch = entryCode.match(new RegExp(`${DEV_TRANSFORM_URL_PREFIX}/pages/lazy-part\\.js`));
		expect(chunkUrlMatch).not.toBeNull();

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
});
