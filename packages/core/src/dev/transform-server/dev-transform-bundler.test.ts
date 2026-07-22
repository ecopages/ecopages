import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAppBuildManifest, setAppBuildManifest } from '../../build/build-adapter.ts';
import { installBuildRuntime } from '../../build/runtime/build-runtime.ts';
import { ConfigBuilder } from '../../config/config-builder.ts';
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
	it('transpiles a module and rewrites relative dynamic imports to dev-transform URLs', async () => {
		const rootDir = createTempRoot('dev-transform-bundler-lazy-import');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });
		fs.writeFileSync(
			path.join(pagesDir, 'lazy-devtools.ts'),
			"export const ReactQueryDevtools = 'devtools';\n",
			'utf8',
		);
		const entrypointPath = path.join(pagesDir, 'login.tsx');
		fs.writeFileSync(
			entrypointPath,
			[
				'export async function loadDevtools() {',
				"  const module = await import('./lazy-devtools.ts');",
				'  return module.ReactQueryDevtools;',
				'}',
			].join('\n'),
			'utf8',
		);

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		installBuildRuntime(config);
		const vendorRegistry = new DevTransformVendorRegistry({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
		});
		const bundler = new DevTransformBundler({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
			vendorRegistry,
		});

		const result = await bundler.transpileModule(entrypointPath);

		expect(result.code).toContain('devtools');
		expect(result.code).toMatch(new RegExp(`${DEV_TRANSFORM_URL_PREFIX}/pages/lazy-devtools\\.js\\?v=[0-9a-f]+`));
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
			["import { label } from '../layouts/docs-layout.tsx';", 'export default function Page() {', '  return label;', '}'].join(
				'\n',
			),
			'utf8',
		);

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		installBuildRuntime(config);
		const bundler = new DevTransformBundler({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
				getRuntimeSpecifierMap: () => new Map(),
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

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		installBuildRuntime(config);
		const bundler = new DevTransformBundler({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
				getRuntimeSpecifierMap: () => new Map(),
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

		const config = await new ConfigBuilder().setRootDir(rootDir).setIntegrations([]).build();
		const existingManifest = getAppBuildManifest(config);
		setAppBuildManifest(config, {
			...existingManifest,
			browserBundlePlugins: [
				...(existingManifest?.browserBundlePlugins ?? []),
				{
					name: 'ecopages:images',
					setup(build) {
						build.onResolve({ filter: /^ecopages:images$/ }, () => ({
							namespace: 'ecopages-images',
							path: 'ecopages:images',
						}));
						build.onLoad({ filter: /.*/, namespace: 'ecopages-images' }, () => ({
							contents: 'export const hero = { src: "/hero.jpg" };',
							loader: 'js',
						}));
					},
				},
			],
		});
		installBuildRuntime(config);

		const bundler = new DevTransformBundler({
			appConfig: config,
			getRuntimeSpecifierMap: () => new Map(),
			vendorRegistry: new DevTransformVendorRegistry({
				appConfig: config,
				getRuntimeSpecifierMap: () => new Map(),
			}),
		});

		const result = await bundler.transpileModule(entrypointPath);

		expect(result.code).toContain('/hero.jpg');
		expect(result.code).not.toMatch(/from ["']images["']/);
		expect(result.code).not.toMatch(/from ["']ecopages:images["']/);
	});
});
