import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { EcoComponent } from '../../../types/public-types.ts';
import { mapComponentGraph } from './component-graph.ts';

function createComponent(input: { integration?: string; children?: EcoComponent[] }): EcoComponent {
	return {
		config: {
			integration: input.integration,
			dependencies: {
				components: input.children ?? [],
			},
		},
	} as EcoComponent;
}

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
