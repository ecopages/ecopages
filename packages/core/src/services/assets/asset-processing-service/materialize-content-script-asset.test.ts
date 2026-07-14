import { expect, test } from 'vitest';
import { materializeContentScriptAsset } from './materialize-content-script-asset.ts';
import type { ContentScriptAsset } from './assets.types.ts';

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
