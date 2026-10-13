import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import type { EcoComponent, ResolvedLazyTrigger } from '../../../types/public-types.ts';
import * as componentGraph from './component-graph.ts';
import {
	collectPageClientPlan,
	planHasForeignChildDescendants,
	selectHydrationIslandEntries,
} from './page-client-plan.ts';

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

test('collectPageClientPlan walks the declared graph once and keeps only foreign-to-parent entries', () => {
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

	const plan = collectPageClientPlan([{ component: root }], 'react');

	assert.equal(walk.mock.calls.length, 1);
	walk.mockRestore();
	assert.deepEqual([...plan.integrationNames].sort(), ['lit', 'react']);
	assert.deepEqual(plan.lazyTriggers, [trigger]);
	assert.deepEqual(plan.lazyClientEntries, []);
	assert.deepEqual(plan.lazyConfigs, []);
	assert.deepEqual(
		plan.islandEntries.map((entry) => entry.file),
		['/app/widget.ts'],
	);
	assert.equal(planHasForeignChildDescendants(plan, root, 'react'), true);
	assert.equal(planHasForeignChildDescendants(plan, island, 'react'), false);
	assert.equal(planHasForeignChildDescendants(plan, island, 'react', [foreign]), true);
	assert.equal(planHasForeignChildDescendants(plan, island, 'react', [root]), true);
	assert.deepEqual(selectHydrationIslandEntries(plan, 'react'), []);
	assert.deepEqual(
		selectHydrationIslandEntries(plan, 'lit').map((entry) => entry.file),
		['/app/widget.ts'],
	);
});

test('collectPageClientPlan does not treat the Html shell as an island', () => {
	const button = createComponent({ integration: 'react', file: '/app/button.tsx' });
	const card = createComponent({ integration: 'react', file: '/app/card.tsx', children: [button] });
	const html = createComponent({ integration: 'react', file: '/app/html.tsx' });
	const page = createComponent({ integration: 'html', file: '/app/page.html', children: [card] });
	const plan = collectPageClientPlan(
		[
			{ component: html, source: 'html-template' },
			{ component: page, source: 'page' },
		],
		'html',
	);

	assert.deepEqual(
		plan.islandEntries.map((entry) => entry.file),
		['/app/card.tsx'],
	);
	assert.deepEqual(
		selectHydrationIslandEntries(plan, 'react').map((entry) => entry.file),
		['/app/card.tsx'],
	);
});

test('selectHydrationIslandEntries hydrates only Foreign Children of a contributing integration', () => {
	const reactIsland = createComponent({ integration: 'react', file: '/app/island.tsx' });
	const page = createComponent({
		integration: 'kitajs',
		file: '/app/page.kita.tsx',
		children: [reactIsland],
	});
	const plan = collectPageClientPlan([{ component: page }], 'kitajs');

	assert.deepEqual(
		selectHydrationIslandEntries(plan, 'react').map((entry) => entry.file),
		['/app/island.tsx'],
	);
	assert.deepEqual(selectHydrationIslandEntries(plan, 'kitajs'), []);
});

test('collectPageClientPlan collects pending lazy client entries from the declared graph', () => {
	const lazyAsset = {
		kind: 'script' as const,
		source: 'content' as const,
		content: 'import "/app/lazy.ts";',
		attributes: { 'data-eco-lazy-key': 'lazy:1' },
	};
	const island = createComponent({ integration: 'react', file: '/app/island.tsx' });
	island.config!._pendingLazyClientAssets = [lazyAsset];
	const root = createComponent({
		integration: 'react',
		file: '/app/page.tsx',
		children: [island],
	});

	const plan = collectPageClientPlan([{ component: root }], 'react');

	assert.deepEqual(plan.lazyClientEntries, [lazyAsset]);
	assert.equal(plan.lazyConfigs.length, 1);
});

test('collectPageClientPlan lists a component as an island when only a later parent is foreign to it', () => {
	const button = createComponent({ integration: 'react', file: '/app/button.tsx' });
	const reactParent = createComponent({ integration: 'react', file: '/app/react-parent.tsx', children: [button] });
	const kitaParent = createComponent({ integration: 'kita', file: '/app/kita-parent.kita.tsx', children: [button] });

	for (const parents of [
		[reactParent, kitaParent],
		[kitaParent, reactParent],
	]) {
		const page = createComponent({ integration: 'kita', file: '/app/page.kita.tsx', children: parents });
		const plan = collectPageClientPlan([{ component: page }], 'kita');

		assert.deepEqual(plan.islandEntries.map((entry) => entry.file).sort(), [
			'/app/button.tsx',
			'/app/react-parent.tsx',
		]);
	}
});

test('collectPageClientPlan lists a component once when several foreign parents reach it', () => {
	const button = createComponent({ integration: 'react', file: '/app/button.tsx' });
	const firstParent = createComponent({ integration: 'kita', file: '/app/first.kita.tsx', children: [button] });
	const secondParent = createComponent({ integration: 'kita', file: '/app/second.kita.tsx', children: [button] });
	const page = createComponent({
		integration: 'lit',
		file: '/app/page.lit.ts',
		children: [firstParent, secondParent],
	});

	const plan = collectPageClientPlan([{ component: page }], 'lit');

	assert.deepEqual(
		plan.islandEntries.map((entry) => entry.file).filter((file) => file === '/app/button.tsx'),
		['/app/button.tsx'],
	);
});
