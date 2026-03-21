import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createRuntimeSpecifierAliasPlugin } from './runtime-specifier-alias-plugin.ts';

test('createRuntimeSpecifierAliasPlugin resolves mapped specifiers as externals', async () => {
	const registrations: Array<{
		filter: RegExp;
		callback: (args: { path: string }) => { path?: string; external?: boolean } | undefined;
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
	assert.deepEqual(registrations[0]?.callback({ path: 'react' }), {
		path: '/assets/vendors/react.js',
		external: true,
	});
	assert.equal(registrations[0]?.callback({ path: 'unknown' }), undefined);
});

test('createRuntimeSpecifierAliasPlugin returns null for an empty specifier map', () => {
	assert.equal(createRuntimeSpecifierAliasPlugin(new Map()), null);
});
