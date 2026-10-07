import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { EcoComponent, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import * as componentGraph from './component-graph.ts';
import { collectPageClientPlan, planHasForeignChildDescendants } from './page-client-plan.ts';

function createComponent(input: {
	integration?: string;
	file?: string;
	triggers?: ResolvedLazyTrigger[];
	children?: EcoComponent[];
}): EcoComponent {
	return {
		config: {
			integration: input.integration,
			identity: input.file
				? { id: input.file, file: input.file, integration: input.integration ?? 'react' }
				: undefined,
			_resolvedLazyTriggers: input.triggers,
			dependencies: {
				components: input.children ?? [],
			},
		},
	} as EcoComponent;
}

test('collectPageClientPlan walks the declared graph once and returns every client entry', () => {
	const walk = vi.spyOn(componentGraph, 'walkComponentGraph');
	const trigger: ResolvedLazyTrigger = {
		triggerId: 'lazy-a',
		rules: [{ 'on:idle': { scripts: ['/lazy-a.js'] } }],
	};
	const island = createComponent({ integration: 'react', file: '/app/island.tsx' });
	const foreign = createComponent({ integration: 'lit', file: '/app/widget.ts' });
	const root = createComponent({
		integration: 'react',
		file: '/app/page.tsx',
		triggers: [trigger],
		children: [island, foreign],
	});

	const plan = collectPageClientPlan([root], 'react');

	assert.equal(plan.walks, 1);
	assert.equal(walk.mock.calls.length, 1);
	walk.mockRestore();
	assert.deepEqual([...plan.integrationNames].sort(), ['lit', 'react']);
	assert.deepEqual(plan.lazyTriggers, [trigger]);
	assert.deepEqual(plan.islandEntries.map((entry) => entry.file).sort(), [
		'/app/island.tsx',
		'/app/page.tsx',
		'/app/widget.ts',
	]);
	assert.equal(planHasForeignChildDescendants(plan, root, 'react'), true);
	assert.equal(planHasForeignChildDescendants(plan, island, 'react'), false);
});
