import { describe, expect, it } from 'vitest';
import type { EcoComponentConfig } from '@ecopages/core';
import {
	collectFromConfigForest,
	collectFromConfigTree,
	someInConfigTree,
	walkConfigForest,
} from './component-config-traversal.ts';

describe('component-config-traversal', () => {
	it('walks each config node only once across nested cycles', () => {
		const leaf: EcoComponentConfig = { dependencies: { modules: ['leaf'] } };
		const child: EcoComponentConfig = { dependencies: { components: [{ config: leaf }] } };
		const root: EcoComponentConfig = {
			dependencies: {
				components: [{ config: child }, { config: leaf }],
			},
		};

		leaf.layout = { config: child } as NonNullable<EcoComponentConfig['layout']>;

		const visited: EcoComponentConfig[] = [];
		walkConfigForest([root], (config) => {
			visited.push(config);
		});

		expect(visited).toEqual([root, child, leaf]);
	});

	it('collects values from multiple roots with shared dedupe traversal', () => {
		const shared: EcoComponentConfig = { dependencies: { modules: ['shared'] } };
		const first: EcoComponentConfig = { dependencies: { components: [{ config: shared }] } };
		const second: EcoComponentConfig = { dependencies: { components: [{ config: shared }], modules: ['second'] } };

		const values = collectFromConfigForest([first, second], (config) => config.dependencies?.modules ?? []);

		expect(values).toEqual(['shared', 'second']);
	});

	it('supports single-tree collection and existence checks', () => {
		const root: EcoComponentConfig = {
			dependencies: {
				modules: ['page-module'],
				components: [{ config: { dependencies: { modules: ['nested-module'] } } }],
			},
		};

		expect(collectFromConfigTree(root, (config) => config.dependencies?.modules ?? [])).toEqual([
			'page-module',
			'nested-module',
		]);
		expect(someInConfigTree(root, (config) => (config.dependencies?.modules?.length ?? 0) > 0)).toBe(true);
		expect(someInConfigTree(undefined, () => true)).toBe(false);
	});
});
