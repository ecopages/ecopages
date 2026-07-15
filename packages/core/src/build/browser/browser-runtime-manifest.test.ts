import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	BrowserRuntimeManifestConflictError,
	createBrowserRuntimeManifest,
	getBrowserRuntimeSpecifierMap,
	mergeBrowserRuntimeManifests,
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
