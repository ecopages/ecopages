import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { LightningCssProcessorPlugin, type LightningCssProcessorPluginConfig } from '../plugin';

const roots: string[] = [];

/** An app in a new temporary folder whose Processor has its context set, with `write` to add files. */
async function createApp(options: LightningCssProcessorPluginConfig = {}) {
	const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-modules-')));
	roots.push(rootDir);
	fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	const processor = new LightningCssProcessorPlugin({ options });
	processor.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
	const write = (relativePath: string, contents: string) => {
		const file = path.join(rootDir, relativePath);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, contents);
		return file;
	};
	return { rootDir, processor, write };
}

beforeEach(() => {
	roots.length = 0;
});

afterEach(() => {
	for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

describe('LightningCssProcessorPlugin, for CSS Modules', () => {
	test('declares that it scopes CSS Modules', async () => {
		const { processor } = await createApp();

		expect(processor.getAssetCapabilities()).toEqual([
			expect.objectContaining({ kind: 'stylesheet', cssModules: true }),
		]);
	});

	test('scopes the classes with [hash]_[local] and returns the class map sorted by key', async () => {
		const { processor, write } = await createApp();
		const file = write('src/button.module.css', '.secondary { color: blue; }\n.primary { color: red; }\n');

		const { css, exports } = await processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);

		expect(Object.keys(exports ?? {})).toEqual(['primary', 'secondary']);
		expect(exports?.primary).toMatch(/^\w+_primary$/u);
		expect(css).toContain(`.${exports!.primary}`);
		expect(css).toContain(`.${exports!.secondary}`);
		expect(css).not.toMatch(/\.primary\b/u);
	});

	test('follows the name of a class with the names it composes', async () => {
		const { processor, write } = await createApp();
		const file = write('src/button.module.css', '.base { margin: 0; }\n.primary { composes: base; color: red; }\n');

		const { exports } = await processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);

		expect(exports?.primary?.split(' ')).toEqual([expect.stringMatching(/_primary$/u), exports!.base]);
	});

	test('bundles the classes composed from another file and lists the file among the dependencies', async () => {
		const { processor, write } = await createApp();
		const base = write('src/base.module.css', '.base { margin: 0; }\n');
		const file = write(
			'src/button.module.css',
			".primary { composes: base from './base.module.css'; color: red; }\n",
		);

		const { css, exports, dependencies } = await processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);

		const [own, composed] = exports!.primary!.split(' ');
		expect(composed).toMatch(/_base$/u);
		expect(css).toContain(`.${composed}`);
		expect(own).toMatch(/_primary$/u);
		expect(dependencies).toEqual([base]);
	});

	test('fails, naming the file, when a class is composed from a file that does not exist', async () => {
		const { processor, write } = await createApp();
		const file = write('src/button.module.css', ".primary { composes: base from './missing.module.css'; }\n");

		await expect(processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file)).rejects.toThrow(
			'button.module.css: composes from "./missing.module.css" names no stylesheet',
		);
	});

	test('gives the same class names from two different folders', async () => {
		const css = '.primary { color: red; }\n.title { composes: primary; }\n';
		const first = await createApp();
		const second = await createApp();

		const results = await Promise.all(
			[first, second].map((app) => {
				const file = app.write('src/ui/button.module.css', css);
				return app.processor.transformStylesheet(css, file);
			}),
		);

		expect(first.rootDir).not.toBe(second.rootDir);
		expect(results[1]).toEqual(results[0]);
	});

	test('hashes the path relative to the app, so two files of one name differ', async () => {
		const { processor, write } = await createApp();
		const css = '.primary { color: red; }\n';
		const first = write('src/a/button.module.css', css);
		const second = write('src/b/button.module.css', css);

		const a = await processor.transformStylesheet(css, first);
		const b = await processor.transformStylesheet(css, second);

		expect(a.exports?.primary).not.toBe(b.exports?.primary);
	});

	test('builds the names from the pattern the options set', async () => {
		const { processor, write } = await createApp({ cssModules: { pattern: '[name]__[local]' } });
		const file = write('src/button.module.css', '.primary { color: red; }\n');

		const { css, exports } = await processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);

		expect(exports).toEqual({ primary: 'button-module__primary' });
		expect(css).toContain('.button-module__primary');
	});

	test('returns no class map for a stylesheet that is not a CSS Module', async () => {
		const { processor, write } = await createApp();
		const file = write('src/button.css', '.primary { color: red; }\n');

		const result = await processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);

		expect(result).not.toHaveProperty('exports');
		expect(result.css).toContain('.primary');
	});

	describe('for a CSS Module of a package', () => {
		const CSS = '.primary { color: red; }\n.title { composes: primary; }\n';
		const pnpmStore = 'node_modules/.pnpm/ui-kit@1.0.0/node_modules/ui-kit';
		const install = (app: Awaited<ReturnType<typeof createApp>>, packageDir: string, css = CSS) => {
			app.write(`${packageDir}/package.json`, '{"name":"ui-kit","version":"1.0.0"}');
			return app.write(`${packageDir}/dist/button.module.css`, css);
		};

		test('gives the same class names in two folders and in a hoisted and a pnpm layout', async () => {
			const hoisted = await createApp();
			const store = await createApp();
			const hoistedFile = install(hoisted, 'node_modules/ui-kit');
			const storeFile = install(store, pnpmStore);

			const a = await hoisted.processor.transformStylesheet(CSS, hoistedFile);
			const b = await store.processor.transformStylesheet(CSS, storeFile);

			expect(hoisted.rootDir).not.toBe(store.rootDir);
			expect(Object.keys(a.exports ?? {})).toEqual(['primary', 'title']);
			expect(b).toEqual(a);
		});

		test('hashes the package name and the path inside it, not the version', async () => {
			const first = await createApp();
			const second = await createApp();
			const a = install(first, 'node_modules/ui-kit');
			second.write('node_modules/ui-kit/package.json', '{"name":"ui-kit","version":"2.0.0"}');
			const b = second.write('node_modules/ui-kit/dist/button.module.css', CSS);

			const ofA = await first.processor.transformStylesheet(CSS, a);
			const ofB = await second.processor.transformStylesheet(CSS, b);

			expect(ofB.exports).toEqual(ofA.exports);
		});

		test('scopes a different class name than an app file of the same name', async () => {
			const app = await createApp();
			const packaged = install(app, 'node_modules/ui-kit');
			const own = app.write('src/dist/button.module.css', CSS);

			const a = await app.processor.transformStylesheet(CSS, packaged);
			const b = await app.processor.transformStylesheet(CSS, own);

			expect(a.exports?.primary).not.toBe(b.exports?.primary);
		});

		test('bundles the classes the module composes from a sibling file of the package', async () => {
			const first = await createApp();
			const second = await createApp();
			const run = async (app: typeof first, packageDir: string) => {
				app.write(`${packageDir}/dist/base.module.css`, '.base { margin: 0; }\n');
				const file = install(
					app,
					packageDir,
					".primary { composes: base from './base.module.css'; color: red; }\n",
				);
				return app.processor.transformStylesheet(fs.readFileSync(file, 'utf8'), file);
			};

			const a = await run(first, 'node_modules/ui-kit');
			const b = await run(second, pnpmStore);

			expect(a.exports?.primary?.split(' ')).toHaveLength(2);
			expect(b).toEqual({ ...a, dependencies: b.dependencies });
			expect(a.css).toContain(`.${a.exports!.primary!.split(' ')[1]}`);
		});

		test('runs no preprocessor over it, as a package ships built CSS', async () => {
			const app = await createApp({
				preprocessor: {
					transform: async (css) => ({ css: css.replace('red', 'blue') }),
					invalidate: () => [],
				},
			});
			const packaged = install(app, 'node_modules/ui-kit');
			const own = app.write('src/button.module.css', CSS);

			const fromPackage = await app.processor.transformStylesheet(CSS, packaged);
			const fromApp = await app.processor.transformStylesheet(CSS, own);

			expect(fromPackage.css).toContain('red');
			expect(fromApp.css).not.toContain('red');
		});
	});
});
