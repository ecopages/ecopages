import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoComponent, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import { mapComponentGraph } from './component-graph.ts';
import {
	collectIntegrationNamesFromGraph,
	collectResolvedLazyTriggersFromGraph,
	hasForeignChildDescendantsInGraph,
} from './component-graph-collectors.ts';

function createComponent(input: {
	integration?: string;
	triggers?: ResolvedLazyTrigger[];
	children?: EcoComponent[];
}): EcoComponent {
	return {
		config: {
			integration: input.integration,
			_resolvedLazyTriggers: input.triggers,
			dependencies: {
				components: input.children ?? [],
			},
		},
	} as EcoComponent;
}

test('collectIntegrationNamesFromGraph walks nested dependency components', () => {
	const root = createComponent({
		integration: 'react',
		children: [createComponent({ integration: 'lit' })],
	});

	const names = collectIntegrationNamesFromGraph([root], 'react');
	assert.deepEqual([...names].sort(), ['lit', 'react']);
});

test('collectResolvedLazyTriggersFromGraph collects triggers from nested components', () => {
	const trigger: ResolvedLazyTrigger = {
		triggerId: 'lazy-a',
		rules: [{ 'on:idle': { scripts: ['/lazy-a.js'] } }],
	};
	const root = createComponent({
		children: [createComponent({ triggers: [trigger] })],
	});

	const triggers = collectResolvedLazyTriggersFromGraph([root], 'react');
	assert.equal(triggers.length, 1);
	assert.equal(triggers[0], trigger);
});

test('hasForeignChildDescendantsInGraph detects foreign integration descendants', () => {
	const sameIntegration = createComponent({
		integration: 'react',
		children: [createComponent({ integration: 'react' })],
	});
	const foreignChild = createComponent({
		integration: 'react',
		children: [createComponent({ integration: 'lit' })],
	});

	assert.equal(hasForeignChildDescendantsInGraph(sameIntegration, 'react'), false);
	assert.equal(hasForeignChildDescendantsInGraph(foreignChild, 'react'), true);
});

test('mapComponentGraph preserves declared ownership mapping semantics', () => {
	const root = createComponent({
		integration: 'react',
		children: [createComponent({ integration: 'lit' })],
	});

	const nodes = mapComponentGraph({
		currentIntegrationName: 'react',
		roots: [{ component: root, source: 'page' }],
		mapNode: (node) => node.integrationName,
	});

	assert.deepEqual(nodes, ['react']);
});
