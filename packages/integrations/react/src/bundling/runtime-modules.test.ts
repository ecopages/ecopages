import { describe, expect, it } from 'vitest';
import { resolveReactPluginRuntimeModuleSlug, resolveReactPluginRuntimeModules } from './runtime-modules.ts';

describe('resolveReactPluginRuntimeModules', () => {
	it('normalizes string entries into vendor bundle config', () => {
		expect(resolveReactPluginRuntimeModules(['@tanstack/react-query'])).toEqual([
			{
				specifier: '@tanstack/react-query',
				outputName: 'tanstack-react-query',
			},
		]);
	});

	it('preserves explicit output names', () => {
		expect(
			resolveReactPluginRuntimeModules([
				{
					specifier: '@tanstack/react-query',
					outputName: 'query',
				},
			]),
		).toEqual([
			{
				specifier: '@tanstack/react-query',
				outputName: 'query',
			},
		]);
	});

	it('builds stable vendor filename stems from scoped specifiers', () => {
		expect(resolveReactPluginRuntimeModuleSlug('@tanstack/react-query')).toBe('tanstack-react-query');
	});

	it('preserves subpath runtime module declarations', () => {
		expect(
			resolveReactPluginRuntimeModules([
				{
					specifier: '@acme/ui/button',
					outputName: 'acme-ui',
				},
			]),
		).toEqual([
			{
				specifier: '@acme/ui/button',
				outputName: 'acme-ui',
			},
		]);
	});
});
