import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	BrowserRuntimeManifestConflictError,
	createBrowserRuntimeManifest,
	getBrowserRuntimeSpecifierMap,
	mergeBrowserRuntimeManifests,
	resolveBrowserRuntimePublicPath,
	resolveRuntimeSpecifierPublicPath,
} from './browser-runtime-manifest.ts';

test('createBrowserRuntimeManifest indexes runtime assets by specifier', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
			mode: 'development',
			externals: ['react-dom'],
		},
	]);

	assert.equal(manifest.assets.length, 1);
	assert.deepEqual(manifest.bySpecifier.get('react'), {
		specifier: 'react',
		owner: '@ecopages/react',
		importPath: 'react',
		publicPath: '/assets/vendors/react.js',
		mode: 'development',
		externals: ['react-dom'],
	});
});

test('createBrowserRuntimeManifest deduplicates identical declarations', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);

	assert.equal(manifest.assets.length, 1);
});

test('createBrowserRuntimeManifest deduplicates equivalent declarations from distinct owners', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
		{
			specifier: 'react',
			owner: 'react-runtime-alias-plugin',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);

	assert.equal(manifest.assets.length, 1);
	assert.equal(manifest.bySpecifier.get('react')?.owner, '@ecopages/react');
});

test('createBrowserRuntimeManifest rejects conflicting declarations', () => {
	assert.throws(
		() =>
			createBrowserRuntimeManifest([
				{
					specifier: 'react',
					owner: '@ecopages/react',
					importPath: 'react',
					publicPath: '/assets/vendors/react.js',
				},
				{
					specifier: 'react',
					owner: 'custom-runtime',
					importPath: 'react',
					publicPath: '/assets/custom/react.js',
				},
			]),
		(error) => {
			assert.ok(error instanceof BrowserRuntimeManifestConflictError);
			assert.equal(error.specifier, 'react');
			assert.match(error.message, /@ecopages\/react maps to \/assets\/vendors\/react\.js/u);
			return true;
		},
	);
});

test('mergeBrowserRuntimeManifests combines manifest declarations with conflict detection', () => {
	const reactManifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
	]);
	const routerManifest = createBrowserRuntimeManifest([
		{
			specifier: '@ecopages/react-router/browser',
			owner: '@ecopages/react-router',
			importPath: '@ecopages/react-router/browser',
			publicPath: '/assets/vendors/react-router.js',
		},
	]);

	const manifest = mergeBrowserRuntimeManifests(reactManifest, undefined, routerManifest);

	assert.deepEqual(Array.from(manifest.bySpecifier.keys()), ['react', '@ecopages/react-router/browser']);
});

test('getBrowserRuntimeSpecifierMap returns concrete public URLs for rewriting', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
		{
			specifier: 'react-dom/client',
			owner: '@ecopages/react',
			importPath: 'react-dom/client',
			publicPath: '/assets/vendors/react-dom-client.js',
		},
	]);

	assert.deepEqual(Array.from(getBrowserRuntimeSpecifierMap(manifest).entries()), [
		['react', '/assets/vendors/react.js'],
		['react-dom/client', '/assets/vendors/react-dom-client.js'],
	]);
});

test('resolveBrowserRuntimePublicPath only maps explicitly configured specifiers', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: '@acme/ui',
			owner: '@ecopages/react',
			importPath: '@acme/ui',
			publicPath: '/assets/vendors/acme-ui.js',
		},
	]);

	assert.equal(resolveBrowserRuntimePublicPath('@acme/ui', manifest), '/assets/vendors/acme-ui.js');
	assert.equal(resolveBrowserRuntimePublicPath('@acme/ui/button', manifest), undefined);
	assert.equal(resolveBrowserRuntimePublicPath('@other/pkg', manifest), undefined);
});

test('resolveBrowserRuntimePublicPath keeps configured specifiers separate', () => {
	const manifest = createBrowserRuntimeManifest([
		{
			specifier: 'react',
			owner: '@ecopages/react',
			importPath: 'react',
			publicPath: '/assets/vendors/react.js',
		},
		{
			specifier: 'react-dom',
			owner: '@ecopages/react',
			importPath: 'react-dom',
			publicPath: '/assets/vendors/react-dom.js',
		},
	]);

	assert.equal(resolveBrowserRuntimePublicPath('react/jsx-runtime', manifest), undefined);
	assert.equal(resolveBrowserRuntimePublicPath('react-dom/client', manifest), undefined);
	assert.equal(resolveBrowserRuntimePublicPath('react-dom', manifest), '/assets/vendors/react-dom.js');
});

test('resolveRuntimeSpecifierPublicPath works against a bare specifier map', () => {
	const map = new Map([
		['@acme/ui', '/assets/vendors/acme-ui.js'],
		['react', '/assets/vendors/react.js'],
	]);

	assert.equal(resolveRuntimeSpecifierPublicPath('@acme/ui/button', map), undefined);
	assert.equal(resolveRuntimeSpecifierPublicPath('react/jsx-runtime', map), undefined);
	assert.equal(resolveRuntimeSpecifierPublicPath('@other/pkg', map), undefined);
});
