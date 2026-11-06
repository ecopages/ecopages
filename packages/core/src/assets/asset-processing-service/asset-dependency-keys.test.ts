import path from 'node:path';
import { describe, expect, it, test } from 'vitest';
import type { EcoBuildPlugin } from '../../build/contracts/build-types.ts';
import { getAssetDependencyKey, getIntegrationDependencyKey } from './asset-dependency-keys.ts';
import { AssetFactory } from './asset.factory.ts';
import type { ContentScriptAsset, ContentStylesheetAsset, ScriptAsset } from './assets.types.ts';

type ScriptBundleOptions = NonNullable<ScriptAsset['bundleOptions']>;

function createContentScript(overrides: Partial<ContentScriptAsset> = {}): ContentScriptAsset {
	return {
		kind: 'script',
		source: 'content',
		content: 'import "/app/src/page.ts";',
		position: 'head',
		attributes: { type: 'module', defer: '' },
		packageRole: 'page-script',
		...overrides,
	};
}

function createContentStylesheet(overrides: Partial<ContentStylesheetAsset> = {}): ContentStylesheetAsset {
	return {
		kind: 'stylesheet',
		source: 'content',
		content: '@import "./tokens.css";',
		inline: true,
		...overrides,
	};
}

const ROOT = '/app';

function keyOf(dependency: Parameters<typeof getAssetDependencyKey>[0], rootDir = ROOT): string {
	return getAssetDependencyKey(dependency, rootDir);
}

describe('getAssetDependencyKey', () => {
	it('keeps content stylesheets with different processing origins apart', () => {
		const aboutStylesheet = createContentStylesheet({ processingOrigin: '/app/src/pages/about.html.css' });
		const contactStylesheet = createContentStylesheet({ processingOrigin: '/app/src/pages/contact.html.css' });
		const originlessStylesheet = createContentStylesheet();

		expect(keyOf(aboutStylesheet)).not.toBe(keyOf(contactStylesheet));
		expect(keyOf(originlessStylesheet)).not.toBe(keyOf(aboutStylesheet));
	});

	it('keeps stylesheet declarations of the same file with different attributes apart', () => {
		const filepath = '/app/src/site.css';

		expect(keyOf(AssetFactory.createFileStylesheet({ filepath, attributes: { media: 'print' } }))).not.toBe(
			keyOf(AssetFactory.createFileStylesheet({ filepath, attributes: { media: 'screen' } })),
		);
	});

	it('keeps a linked and an inline declaration of the same stylesheet apart', () => {
		const filepath = '/app/src/site.css';

		expect(keyOf(AssetFactory.createFileStylesheet({ filepath }))).not.toBe(
			keyOf({ ...AssetFactory.createFileStylesheet({ filepath }), inline: true }),
		);
	});

	it('keeps a classic and a module declaration of the same file apart', () => {
		const filepath = '/app/src/pages/greeting.ts';

		expect(keyOf(AssetFactory.createFileScript({ filepath, classic: true }))).not.toBe(
			keyOf(AssetFactory.createFileScript({ filepath })),
		);
	});

	it('keeps content bundles with different source files apart', () => {
		const createBundle = (bundledSourceFilepaths: string[]) =>
			AssetFactory.createContentStylesheet({
				content: '.example { color: red; }',
				attributes: { rel: 'stylesheet' },
				packageRole: 'page-style',
				bundledSourceFilepaths,
			});

		expect(keyOf(createBundle(['/app/a.css', '/app/b.css']))).not.toBe(
			keyOf(createBundle(['/app/d.css', '/app/e.css'])),
		);
	});

	describe('content scripts', () => {
		const base = createContentScript();

		test.each<[string, Partial<ContentScriptAsset>]>([
			['bundleOptions.minify', { bundleOptions: { minify: true } }],
			[
				'HTML attributes',
				{ attributes: { type: 'module', defer: '', 'data-eco-page-bootstrap': 'react-router' } },
			],
			['missing attributes', { attributes: undefined }],
			['content of a page-script without bundled sources', { content: 'import "/app/src/other.ts";' }],
			['groupedBundle', { groupedBundle: { id: 'bundle-1', entryName: 'page-entry' } }],
		])('a different %s changes the key', (_name, overrides) => {
			expect(keyOf(createContentScript(overrides))).not.toBe(keyOf(base));
		});

		it('is stable for duplicate declarations with the same build signature', () => {
			const bundleOptions = { naming: '[name]-[hash].[ext]', external: ['react'] };

			expect(keyOf(createContentScript({ bundleOptions }))).toBe(
				keyOf(createContentScript({ bundleOptions: { ...bundleOptions } })),
			);
		});
	});

	describe("build-wide options are part of a script's identity", () => {
		const filepath = '/app/src/components/counter.script.ts';
		const jsxOverride = (cacheKey: string): EcoBuildPlugin => ({
			name: 'ecopages-foreign-jsx-override',
			cacheKey,
			setup: () => {},
		});

		test.each<[string, ScriptBundleOptions, ScriptBundleOptions]>([
			['define', { define: { DEBUG: 'true' } }, { define: { DEBUG: 'false' } }],
			['treeshaking', { treeshaking: true }, { treeshaking: false }],
			['plugin cacheKey', { plugins: [jsxOverride('react')] }, { plugins: [jsxOverride('preact')] }],
			['splitting', { splitting: true }, { splitting: false }],
			['excludeAppBuildPlugins', {}, { excludeAppBuildPlugins: ['ecopages-alias-resolver'] }],
		])('two declarations of one file that differ only in %s get different keys', (_name, left, right) => {
			expect(keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: left }))).not.toBe(
				keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: right })),
			);
		});

		it('changes with the order of plugins, since the first plugin to answer a hook wins', () => {
			const alias: EcoBuildPlugin = { name: 'alias', setup: () => {} };
			const override = jsxOverride('react');

			expect(
				keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: { plugins: [alias, override] } })),
			).not.toBe(
				keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: { plugins: [override, alias] } })),
			);
		});

		it('does not depend on the order of define entries', () => {
			expect(
				keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: { define: { A: '1', B: '2' } } })),
			).toBe(keyOf(AssetFactory.createFileScript({ filepath, bundleOptions: { define: { B: '2', A: '1' } } })));
		});
	});

	describe('a project moved to another root', () => {
		const declarationsUnder = (rootDir: string) => {
			const member = (file: string) => path.join(rootDir, 'src', file);
			const members = [member('a.script.ts'), member('b.script.ts')];
			return [
				AssetFactory.createFileScript({ filepath: member('counter.script.ts') }),
				AssetFactory.createFileStylesheet({ filepath: member('site.css') }),
				createContentStylesheet({ processingOrigin: member('pages/about.html.css') }),
				AssetFactory.createNodeModuleScript({
					importPath: path.join(rootDir, 'node_modules/radiant/hydrator.js'),
				}),
				createContentScript({
					content: members.map((filePath) => `import ${JSON.stringify(filePath)};`).join('\n'),
					bundledSourceFilepaths: members,
				}),
			];
		};

		it('keeps every dependency key', () => {
			const before = declarationsUnder('/builds/one/app').map((dependency) =>
				keyOf(dependency, '/builds/one/app'),
			);
			const after = declarationsUnder('/srv/two/app').map((dependency) => keyOf(dependency, '/srv/two/app'));

			expect(after).toEqual(before);
		});

		it('still tells two files of the same project apart', () => {
			expect(keyOf(AssetFactory.createFileScript({ filepath: '/app/src/a.ts' }))).not.toBe(
				keyOf(AssetFactory.createFileScript({ filepath: '/app/src/b.ts' })),
			);
		});
	});

	describe('getIntegrationDependencyKey', () => {
		const declared = createContentScript();

		it('keys a declaration the same after the app-wide build assigns its bundle', () => {
			expect(
				getIntegrationDependencyKey(
					'react',
					{ ...declared, bundle: true, groupedBundle: { id: 'app-browser-client', entryName: 'client-1' } },
					ROOT,
				),
			).toBe(getIntegrationDependencyKey('react', declared, ROOT));
		});

		it('keeps the declarations of two Integrations apart', () => {
			expect(getIntegrationDependencyKey('react', declared, ROOT)).not.toBe(
				getIntegrationDependencyKey('preact', declared, ROOT),
			);
		});
	});
});
