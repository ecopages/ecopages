import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoBuildOnResolveResult } from './build-types.ts';
import { createRuntimeSpecifierAliasPlugin } from './runtime-specifier-alias-plugin.ts';
import { collectRuntimeSpecifierAliasMap, rewriteRuntimeSpecifierAliases } from './runtime-specifier-aliases.ts';

test('createRuntimeSpecifierAliasPlugin resolves mapped specifiers as externals', async () => {
	const registrations: Array<{
		filter: RegExp;
		callback: (args: {
			path: string;
		}) => EcoBuildOnResolveResult | undefined | Promise<EcoBuildOnResolveResult | undefined>;
	}> = [];
	const plugin = createRuntimeSpecifierAliasPlugin(
		{
			react: '/assets/vendors/react.js',
			'react-dom/client': '/assets/vendors/react-dom.js',
		},
		{ name: 'test-runtime-alias' },
	);

	assert.ok(plugin);
	assert.equal(plugin.name, 'test-runtime-alias');

	plugin.setup({
		onResolve(options, callback) {
			registrations.push({ filter: options.filter, callback });
		},
		onLoad() {},
		module() {},
	});

	assert.equal(registrations.length, 1);
	assert.equal(registrations[0]?.filter.test('react'), true);
	assert.deepEqual(await registrations[0]?.callback({ path: 'react' }), {
		path: '/assets/vendors/react.js',
		external: true,
	});
	assert.equal(await registrations[0]?.callback({ path: 'unknown' }), undefined);
});

test('createRuntimeSpecifierAliasPlugin returns null for an empty specifier map', () => {
	assert.equal(createRuntimeSpecifierAliasPlugin(new Map()), null);
});

test('createRuntimeSpecifierAliasPlugin exposes alias data for emitted-JS fallback rewriting', () => {
	const plugin = createRuntimeSpecifierAliasPlugin(
		{
			react: '/assets/vendors/react.js',
			'react/jsx-dev-runtime': '/assets/vendors/react-jsx-dev-runtime.js',
		},
		{ name: 'test-runtime-alias' },
	);

	assert.ok(plugin);

	const aliasMap = collectRuntimeSpecifierAliasMap([plugin]);
	assert.equal(aliasMap.get('react'), '/assets/vendors/react.js');
	assert.equal(aliasMap.get('react/jsx-dev-runtime'), '/assets/vendors/react-jsx-dev-runtime.js');
	assert.equal(
		rewriteRuntimeSpecifierAliases(
			'import { jsxDEV } from "react/jsx-dev-runtime";\nconst snippet = "import { jsxDEV } from \'react/jsx-dev-runtime\'";',
			aliasMap,
		),
		'import { jsxDEV } from "/assets/vendors/react-jsx-dev-runtime.js";\nconst snippet = "import { jsxDEV } from \'react/jsx-dev-runtime\'";',
	);
});
