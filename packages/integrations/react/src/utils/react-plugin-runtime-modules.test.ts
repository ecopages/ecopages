import { describe, expect, it } from 'vitest';
import {
	mergeReactPluginRuntimeModules,
	resolveReactPluginRuntimeModuleSlug,
	resolveReactPluginRuntimeModules,
} from './react-plugin-runtime-modules.ts';

describe('resolveReactPluginRuntimeModules', () => {
	it('normalizes string entries into vendor bundle config', () => {
		expect(resolveReactPluginRuntimeModules(['@tanstack/react-query'])).toEqual([
			{
				specifier: '@tanstack/react-query',
				outputName: 'tanstack-react-query',
				externals: [],
			},
		]);
	});

	it('preserves explicit output names and externals', () => {
		expect(
			resolveReactPluginRuntimeModules([
				{
					specifier: '@tanstack/react-query',
					outputName: 'query',
					externals: ['react'],
				},
			]),
		).toEqual([
			{
				specifier: '@tanstack/react-query',
				outputName: 'query',
				externals: ['react'],
			},
		]);
	});

	it('builds stable vendor filename stems from scoped specifiers', () => {
		expect(resolveReactPluginRuntimeModuleSlug('@tanstack/react-query')).toBe('tanstack-react-query');
	});

	it('merges auto-discovered specifiers with manual runtime module overrides', () => {
		expect(
			mergeReactPluginRuntimeModules(
				resolveReactPluginRuntimeModules([
					{
						specifier: '@tanstack/react-query',
						outputName: 'custom-query-vendor',
					},
				]),
				['@tanstack/react-query', 'jotai'],
			),
		).toEqual([
			{
				specifier: '@tanstack/react-query',
				outputName: 'custom-query-vendor',
				externals: [],
			},
			{
				specifier: 'jotai',
				outputName: 'jotai',
				externals: [],
			},
		]);
	});
});
