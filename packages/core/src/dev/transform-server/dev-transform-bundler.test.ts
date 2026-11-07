import fs from 'node:fs';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appLogger } from '../../global/app-logger.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { DEV_TRANSFORM_URL_PREFIX } from './dev-transform-url.ts';
import { DevTransformBundler } from './dev-transform-bundler.ts';
import { DevTransformVendorRegistry } from './dev-transform-vendor-registry.ts';

const tempRoots: string[] = [];

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

describe('DevTransformBundler', () => {
	it('names the build plugin and the file that failed to load', async () => {
		const rootDir = createTempRoot('dev-transform-bundler-plugin-error');
		const entrypointPath = path.join(rootDir, 'src', 'widget.ts');
		fs.mkdirSync(path.dirname(entrypointPath), { recursive: true });
		fs.writeFileSync(entrypointPath, 'export const widget = true;\n', 'utf8');

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const bundler = new DevTransformBundler({
			appConfig: config,
			contributors: [
				{
					ownsModule: () => true,
					getModulePlugins: async () => [
						{
							name: 'widget-loader',
							setup(build) {
								build.onLoad({ filter: /widget\.ts$/ }, () => {
									throw new Error('loader boom');
								});
							},
						},
					],
				},
			],
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
			}),
		});

		await expect(bundler.transpileModule(entrypointPath)).rejects.toThrow(
			`[widget-loader] ${fs.realpathSync(entrypointPath)}: loader boom`,
		);
	});

	it('rewrites local imports with a new content-hash query when the dependency changes', async () => {
		const rootDir = createTempRoot('dev-transform-bundler-import-version');
		const layoutsDir = path.join(rootDir, 'src', 'layouts');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(layoutsDir, { recursive: true });
		fs.mkdirSync(pagesDir, { recursive: true });

		const layoutPath = path.join(layoutsDir, 'docs-layout.tsx');
		const pagePath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(layoutPath, "export const label = 'before';\n", 'utf8');
		fs.writeFileSync(
			pagePath,
			[
				"import { label } from '../layouts/docs-layout.tsx';",
				'export default function Page() {',
				'  return label;',
				'}',
			].join('\n'),
			'utf8',
		);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const bundler = new DevTransformBundler({
			appConfig: config,
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
			}),
		});

		const before = await bundler.transpileModule(pagePath);
		const beforeMatch = before.code.match(
			new RegExp(`${DEV_TRANSFORM_URL_PREFIX}/layouts/docs-layout\\.js\\?v=([0-9a-f]+)`),
		);
		expect(beforeMatch?.[1]).toBeTruthy();

		fs.writeFileSync(layoutPath, "export const label = 'after';\n", 'utf8');
		const after = await bundler.transpileModule(pagePath);
		const afterMatch = after.code.match(
			new RegExp(`${DEV_TRANSFORM_URL_PREFIX}/layouts/docs-layout\\.js\\?v=([0-9a-f]+)`),
		);
		expect(afterMatch?.[1]).toBeTruthy();
		expect(afterMatch?.[1]).not.toBe(beforeMatch?.[1]);
	});

	it('transpiles same-basename modules concurrently without mixing output', async () => {
		const rootDir = createTempRoot('dev-transform-bundler-concurrent-basename');
		const firstPath = path.join(rootDir, 'src', 'pages', 'index.tsx');
		const secondPath = path.join(rootDir, 'src', 'components', 'index.tsx');
		fs.mkdirSync(path.dirname(firstPath), { recursive: true });
		fs.mkdirSync(path.dirname(secondPath), { recursive: true });
		fs.writeFileSync(firstPath, "export const source = 'page';\n", 'utf8');
		fs.writeFileSync(secondPath, "export const source = 'component';\n", 'utf8');

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const bundler = new DevTransformBundler({
			appConfig: config,
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
			}),
		});

		const [pageResult, componentResult] = await Promise.all([
			bundler.transpileModule(firstPath),
			bundler.transpileModule(secondPath),
		]);

		expect(pageResult.code).toContain('page');
		expect(componentResult.code).toContain('component');
	});

	it('inlines ecopages:images virtual modules instead of emitting a bare images import', async () => {
		const rootDir = createTempRoot('dev-transform-bundler-virtual-images');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		const entrypointPath = path.join(pagesDir, 'images.tsx');
		fs.writeFileSync(
			entrypointPath,
			["import { hero } from 'ecopages:images';", 'export const src = hero.src;'].join('\n'),
			'utf8',
		);

		const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
		const runtime = requireAppRuntime(config);
		const existingManifest = runtime.buildManifest;
		runtime.buildManifest = {
			...existingManifest,
			browser: [
				...existingManifest.browser,
				{
					name: 'ecopages:images',
					setup(build) {
						build.module('ecopages:images', () => ({
							contents: 'export const hero = { src: "/hero.jpg" };',
							loader: 'js',
						}));
					},
				},
			],
		};

		const bundler = new DevTransformBundler({
			appConfig: config,
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
			}),
		});

		const result = await bundler.transpileModule(entrypointPath);

		expect(result.code).toContain('/hero.jpg');
		expect(result.code).not.toMatch(/from ["']images["']/);
		expect(result.code).not.toMatch(/from ["']ecopages:images["']/);
	});
	describe('a Worker URL', () => {
		async function transpileScript(rootDir: string, source: string) {
			const scriptPath = path.join(rootDir, 'src', 'components', 'demo.script.ts');
			fs.mkdirSync(path.join(rootDir, 'src', 'components', 'workers'), { recursive: true });
			fs.writeFileSync(
				path.join(rootDir, 'src', 'components', 'workers', 'echo.worker.ts'),
				"self.postMessage('hi');\n",
			);
			fs.writeFileSync(scriptPath, source, 'utf8');
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const bundler = new DevTransformBundler({
				appConfig: config,
				vendorRegistry: new DevTransformVendorRegistry({ appConfig: config }),
			});
			return bundler.transpileModule(scriptPath);
		}

		it.each(['Worker', 'SharedWorker'])(
			'of a module %s points at the dev transform URL of the worker',
			async (name) => {
				const rootDir = createTempRoot('dev-transform-bundler-worker');
				const result = await transpileScript(
					rootDir,
					`export const worker = new ${name}(new URL('./workers/echo.worker.ts', import.meta.url), { type: 'module' });\n`,
				);

				expect(result.code).toMatch(
					new RegExp(
						`new URL\\(["']${DEV_TRANSFORM_URL_PREFIX}/components/workers/echo\\.worker\\.js\\?v=[0-9a-f]+["'], import\\.meta\\.url\\)`,
					),
				);
				expect(result.code).not.toContain('echo.worker.ts');
				expect(result.dependencies).toContain(
					path.join(rootDir, 'src', 'components', 'workers', 'echo.worker.ts'),
				);
			},
		);

		it('gets a new version query when the worker changes', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-worker-version');
			const source =
				"export const worker = new Worker(new URL('./workers/echo.worker.ts', import.meta.url), { type: 'module' });\n";
			const workerVersion = (code: string) => code.match(/echo\.worker\.js\?v=([0-9a-f]+)/)?.[1];
			const before = workerVersion((await transpileScript(rootDir, source)).code);

			fs.writeFileSync(
				path.join(rootDir, 'src', 'components', 'workers', 'echo.worker.ts'),
				"self.postMessage('changed');\n",
			);
			const config = await finalizeEcoPagesConfig({ rootDir, integrations: [] });
			const after = await new DevTransformBundler({
				appConfig: config,
				vendorRegistry: new DevTransformVendorRegistry({ appConfig: config }),
			}).transpileModule(path.join(rootDir, 'src', 'components', 'demo.script.ts'));

			expect(before).toBeTruthy();
			expect(workerVersion(after.code)).toBeTruthy();
			expect(workerVersion(after.code)).not.toBe(before);
		});

		it('that does not resolve fails, naming the URL', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-missing-worker');

			await expect(
				transpileScript(
					rootDir,
					"export const worker = new Worker(new URL('./workers/missing.worker.ts', import.meta.url), { type: 'module' });\n",
				),
			).rejects.toThrow('"./workers/missing.worker.ts"');
		});

		it('held in a variable is left as written with a warning naming the file', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-indirect-worker');
			const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);

			const result = await transpileScript(
				rootDir,
				"const workerUrl = new URL('./workers/echo.worker.ts', import.meta.url);\nexport const worker = new Worker(workerUrl, { type: 'module' });\n",
			);

			expect(result.code).toContain('new Worker(workerUrl');
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('demo.script.ts'));
		});

		it('with a query fails, naming the URL', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-query-worker');

			await expect(
				transpileScript(
					rootDir,
					"export const worker = new Worker(new URL('./workers/echo.worker.ts?v=1', import.meta.url), { type: 'module' });\n",
				),
			).rejects.toThrow('"./workers/echo.worker.ts?v=1" in');
		});

		it('that is not relative is left as written with a warning', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-public-worker');
			const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);

			const result = await transpileScript(
				rootDir,
				"export const worker = new Worker(new URL('/workers/echo.js', import.meta.url), { type: 'module' });\n",
			);

			expect(result.code).toContain('/workers/echo.js');
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not relative'));
		});

		it('of a classic worker fails, naming the URL', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-classic-worker');

			await expect(
				transpileScript(
					rootDir,
					"export const worker = new Worker(new URL('./workers/echo.worker.ts', import.meta.url));\n",
				),
			).rejects.toThrow(`new Worker(new URL("./workers/echo.worker.ts", import.meta.url)) in`);
		});

		it('that is not a literal is left as written with a warning', async () => {
			const rootDir = createTempRoot('dev-transform-bundler-dynamic-worker');
			const warn = vi.spyOn(appLogger, 'warn').mockImplementation(() => appLogger);

			const result = await transpileScript(
				rootDir,
				"const name = 'echo';\nexport const worker = new Worker(new URL(`./workers/${name}.worker.ts`, import.meta.url), { type: 'module' });\n",
			);

			expect(result.code).toContain('./workers/${name}.worker.ts');
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('is not a string literal'));
		});
	});
});
