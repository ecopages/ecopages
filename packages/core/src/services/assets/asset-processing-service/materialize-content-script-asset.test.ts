import { fileSystem } from '@ecopages/file-system';
import { afterEach, expect, test, vi } from 'vitest';
import { materializeContentScriptAsset } from './materialize-content-script-asset.ts';
import type { ContentScriptAsset } from './assets.types.ts';

afterEach(() => {
	vi.restoreAllMocks();
});

test('materializeContentScriptAsset copies declarative fields from the dependency', () => {
	const dependency: ContentScriptAsset = {
		kind: 'script',
		source: 'content',
		content: 'console.log("hydrate")',
		bundle: false,
		packageRole: 'page-script',
		position: 'head',
		groupedBundle: { id: 'ecopages-react-router-pages', entryName: 'pages__index' },
		attributes: { type: 'module', 'data-eco-page-bootstrap': 'react-router' },
	};

	expect(materializeContentScriptAsset(dependency, '/dist/assets/scripts/page.js')).toEqual({
		filepath: '/dist/assets/scripts/page.js',
		kind: 'script',
		inline: false,
		position: 'head',
		attributes: { type: 'module', 'data-eco-page-bootstrap': 'react-router' },
		excludeFromHtml: undefined,
		packageRole: 'page-script',
		groupedBundle: { id: 'ecopages-react-router-pages', entryName: 'pages__index' },
		bundledSourceFilepaths: undefined,
	});
});

test('materializeContentScriptAsset reads bundled inline script output from the cache filepath', () => {
	vi.spyOn(fileSystem, 'readFileSync').mockReturnValue('console.log("bundled")');
	vi.spyOn(fileSystem, 'exists').mockReturnValue(true);

	const dependency: ContentScriptAsset = {
		kind: 'script',
		source: 'content',
		content: 'import "./broken-absolute-path.js";',
		inline: true,
		bundle: true,
		position: 'head',
		attributes: { type: 'module' },
	};

	expect(materializeContentScriptAsset(dependency, '/dist/assets/scripts/bootstrap.js')).toEqual({
		filepath: '/dist/assets/scripts/bootstrap.js',
		kind: 'script',
		inline: true,
		content: 'console.log("bundled")',
		position: 'head',
		attributes: { type: 'module' },
		excludeFromHtml: undefined,
		packageRole: undefined,
		groupedBundle: undefined,
		bundledSourceFilepaths: undefined,
	});
});
