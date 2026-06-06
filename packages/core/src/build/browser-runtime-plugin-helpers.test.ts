import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	buildSpecifierFilter,
	escapeRegExp,
	toRuntimeSpecifierMap,
} from './browser-runtime-plugin-helpers.ts';

test('escapeRegExp escapes all regex metacharacters', () => {
	const sample = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
	const escaped = escapeRegExp(sample);
	assert.equal(escaped, 'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
	const matcher = new RegExp(`^${escaped}$`);
	assert.equal(matcher.test(sample), true);
	assert.equal(matcher.test('aXbXcXdXeXfXgXhXiXjXkXlXmXnXo'), false);
});

test('toRuntimeSpecifierMap returns a Map for Map input', () => {
	const source = new Map<string, string>([
		['react', '/vendor/react.js'],
		['react-dom', '/vendor/react-dom.js'],
	]);
	const result = toRuntimeSpecifierMap(source);
	assert.ok(result instanceof Map);
	assert.equal(result.size, 2);
	assert.equal(result.get('react'), '/vendor/react.js');
	assert.equal(result.get('react-dom'), '/vendor/react-dom.js');
});

test('toRuntimeSpecifierMap returns a Map for Record input', () => {
	const result = toRuntimeSpecifierMap({
		react: '/vendor/react.js',
		'react-dom': '/vendor/react-dom.js',
	});
	assert.ok(result instanceof Map);
	assert.equal(result.size, 2);
	assert.equal(result.get('react'), '/vendor/react.js');
	assert.equal(result.get('react-dom'), '/vendor/react-dom.js');
});

test('toRuntimeSpecifierMap returns a defensive copy of Map input', () => {
	const source = new Map<string, string>([['react', '/vendor/react.js']]);
	const result = toRuntimeSpecifierMap(source);
	result.set('mutated', 'value');
	assert.equal(source.has('mutated'), false, 'mutating result must not affect source');
});

test('buildSpecifierFilter returns null for an empty map', () => {
	assert.equal(buildSpecifierFilter(new Map()), null);
});

test('buildSpecifierFilter matches a single specifier exactly', () => {
	const filter = buildSpecifierFilter(new Map([['react', '/vendor/react.js']]))!;
	assert.equal(filter.test('react'), true);
	assert.equal(filter.test('react-dom'), false);
	assert.equal(filter.test('react/extra'), false);
	assert.equal(filter.test('xreact'), false);
});

test('buildSpecifierFilter matches any of multiple specifiers', () => {
	const filter = buildSpecifierFilter(
		new Map([
			['react', '/vendor/react.js'],
			['react-dom', '/vendor/react-dom.js'],
		]),
	)!;
	assert.equal(filter.test('react'), true);
	assert.equal(filter.test('react-dom'), true);
	assert.equal(filter.test('vue'), false);
});

test('buildSpecifierFilter escapes regex metacharacters in specifier keys', () => {
	const filter = buildSpecifierFilter(
		new Map([
			['@scope/pkg', '/vendor/scope-pkg.js'],
			['plain.spec', '/vendor/plain.js'],
		]),
	)!;
	assert.equal(filter.test('@scope/pkg'), true);
	assert.equal(filter.test('@scopeXpkg'), false, 'dot must be escaped, not interpreted as wildcard');
	assert.equal(filter.test('plain.spec'), true);
	assert.equal(filter.test('plainXspec'), false);
});
